#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { looksLikeVerbPhrase, runDoctor } from "./validate/doctor.js";
import { VspecError } from "./errors.js";
import { initProject } from "./project.js";
import { createUseCase, listUseCases, showUseCase } from "./usecase-commands.js";
import {
  applyActorBody,
  applyStakeholderBody,
  createActor,
  createGoal,
  createStakeholder,
  listActors,
  listGoals,
  listStakeholders,
  promoteGoal,
  rejectGoal,
  setActorField,
  setStakeholderField,
  showActor,
  showGoal,
  showStakeholder,
} from "./entity-commands.js";
import { applyUseCaseBody, applyUseCaseSection, setUseCaseField } from "./mutators.js";
import { BODY_SECTIONS } from "./format/parse.js";
import { errorInfo, outputError, outputSuccess } from "./output.js";
import { aiGuideText } from "./ai-guide.js";
import { exportGherkin } from "./export/gherkin.js";

export function buildProgram(): Command {
  const program = new Command();
  program.name("vspec").description("Local-first Cockburn use-case specs").version("0.1.0");

  program
    .command("init")
    .description("Create .vspec/config.json and specs directories")
    .option("--key <prefix>", "use-case key prefix")
    .action((options: { key?: string }) =>
      runCommand(() => initProject({ key: options.key }), (result) => ({
        data: result,
        affectedFiles: result.affectedFiles.map((path) => ({ path })),
        suggestedNextActions: [
          { command: "vspec actor create --name developer", reason: "Add the primary actor." },
          { command: "vspec usecase create --title \"...\" --primary-actor developer", reason: "Create the first use case." },
        ],
      })),
    );

  program.command("ai-guide").description("Print an end-to-end authoring guide").action(() => {
    outputSuccess({
      data: { guide: aiGuideText() },
      suggestedNextActions: [{ command: "vspec init --key VSPEC", reason: "Start the workflow." }],
    });
  });

  program
    .command("doctor")
    .description("Validate specs offline")
    .argument("[target]", "use-case key or path")
    .action((target: string | undefined) => {
      const result = runDoctor({ target });
      const errors = result.findings.filter((finding) => finding.level === "error");
      const warnings = result.findings.filter((finding) => finding.level === "warn");
      const summary = { errors: errors.length, warnings: warnings.length };
      const data = { files: result.files, summary, findings: result.findings };

      if (errors.length > 0) {
        outputError({
          code: "VALIDATION_FAILED",
          message: `${errors.length} validation error(s).`,
          details: { summary, findings: result.findings },
          actions: suggestDoctorActions(result.findings),
        });
        return;
      }
      outputSuccess({
        data,
        suggestedNextActions: [
          ...result.promotable.map((key) => ({
            command: `vspec usecase set ${key} --field format --value FULLY_DRESSED`,
            reason: "All required sections are present — promote from BRIEF/CASUAL to FULLY_DRESSED.",
          })),
          { command: "vspec export gherkin <KEY>", reason: "Export validated use cases." },
        ],
        warnings: warnings.map((finding) => ({ message: finding.message })),
      });
    });

  const usecase = program.command("usecase").description("Create, list, and show use cases");
  usecase
    .command("create")
    .requiredOption("--title <title>", "use-case title")
    .requiredOption("--primary-actor <name>", "primary actor name")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1")
    .option("--from <goal>", "source goal id")
    .action((options: { title: string; primaryActor: string; level: string; priority: string; from?: string }) =>
      runCommand(() => createUseCase(options), (created) => ({
        data: created,
        affectedFiles: created.affectedFiles.map((path) => ({ path })),
        warnings: looksLikeVerbPhrase(options.title)
          ? []
          : [{ message: `Title "${options.title}" is not a verb phrase. Cockburn titles read as a goal, e.g. "주문을 생성한다" / "Place an order".` }],
        suggestedNextActions: [
          { command: `vspec usecase apply ${created.key} --section main-success`, reason: "Author the main success steps (pipe the numbered list via stdin)." },
          { command: `vspec doctor ${created.key}`, reason: "Validate before committing." },
        ],
      })),
    );
  usecase
    .command("list")
    .option("--status <status>")
    .option("--actor <actor>")
    .option("--level <level>")
    .option("--q <query>")
    .action((options: { status?: string; actor?: string; level?: string; q?: string }) =>
      runCommand(() => listUseCases(options), (items) => ({
        data: items,
        suggestedNextActions: [{ command: "vspec usecase show <KEY>", reason: "Inspect a use case." }],
      })),
    );
  usecase
    .command("show")
    .argument("<key>", "use-case key")
    .action((key: string) =>
      runCommand(() => showUseCase({ key }), (shown) => ({
        data: shown.useCase,
        suggestedNextActions: [{ command: `vspec doctor ${key}`, reason: "Validate this use case." }],
      })),
    );
  usecase
    .command("set")
    .argument("<key>")
    .requiredOption("--field <name>", "title|level|format|status|priority|scope|frequency")
    .requiredOption("--value <value>", "new value (validated against the field)")
    .action((key: string, options: { field: string; value: string }) =>
      runCommand(() => setUseCaseField({ key, ...options }), (result) => mutationPayload(result, key)),
    );
  usecase
    .command("apply")
    .description("Replace the body (or one --section) from content piped via stdin")
    .argument("<key>", "use-case key")
    .option("--section <name>", `one of: ${BODY_SECTIONS.join("|")} (omit to replace the whole body)`)
    .action((key: string, options: { section?: string }) =>
      runCommand(() => {
        const input = readStdin();
        if (options.section) return applyUseCaseSection({ key, section: options.section, content: input });
        if (input.trim().length === 0) {
          throw new VspecError(
            "INVALID_ARGUMENT",
            "Whole-body apply needs the full use-case body on stdin. To clear a single section instead, use --section <name>.",
          );
        }
        return applyUseCaseBody({ key, body: input });
      }, (result) => applyPayload(result, key, !options.section)),
    );

  const actor = program.command("actor").description("Create, list, and show actors");
  actor
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "primary|supporting|offstage", "primary")
    .option("--human", "force the actor human (default: human for primary, non-human otherwise)")
    .option("--no-human", "force the actor non-human")
    .option("--alias <alias...>")
    .action((options: { name: string; displayName?: string; type?: string; human?: boolean; alias?: string[] }) =>
      runCommand(() => createActor(options), (result) => entityPayload(result, "vspec usecase create --title \"...\" --primary-actor " + result.name)),
    );
  actor.command("list").action(() =>
    runCommand(() => listActors({}), (data) => ({ data, suggestedNextActions: [{ command: "vspec actor show <name>" }] })),
  );
  actor
    .command("show")
    .argument("<name>")
    .action((name: string) =>
      runCommand(() => showActor({ name }), (data) => ({ data, suggestedNextActions: [{ command: "vspec usecase create --title \"...\" --primary-actor " + name }] })),
    );
  actor
    .command("set")
    .argument("<name>")
    .requiredOption("--field <name>", "display_name|type|is_human")
    .requiredOption("--value <value>", "new value (validated against the field)")
    .action((name: string, options: { field: string; value: string }) =>
      runCommand(() => setActorField({ name, ...options }), (result) => entityMutationPayload(result)),
    );
  actor
    .command("apply")
    .description("Replace the actor description body from content piped via stdin")
    .argument("<name>")
    .action((name: string) =>
      runCommand(() => applyActorBody({ name, body: readStdin() }), (result) => entityMutationPayload(result)),
    );

  const stakeholder = program.command("stakeholder").description("Create, list, and show stakeholders");
  stakeholder
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "internal|external|regulatory", "internal")
    .action((options: { name: string; displayName?: string; type?: string }) =>
      runCommand(() => createStakeholder(options), (result) => entityPayload(result, "vspec usecase apply <KEY> --section stakeholders")),
    );
  stakeholder.command("list").action(() =>
    runCommand(() => listStakeholders({}), (data) => ({ data, suggestedNextActions: [{ command: "vspec stakeholder show <name>" }] })),
  );
  stakeholder
    .command("show")
    .argument("<name>")
    .action((name: string) =>
      runCommand(() => showStakeholder({ name }), (data) => ({ data, suggestedNextActions: [{ command: "vspec usecase apply <KEY> --section stakeholders" }] })),
    );
  stakeholder
    .command("set")
    .argument("<name>")
    .requiredOption("--field <name>", "display_name|type")
    .requiredOption("--value <value>", "new value (validated against the field)")
    .action((name: string, options: { field: string; value: string }) =>
      runCommand(() => setStakeholderField({ name, ...options }), (result) => entityMutationPayload(result)),
    );
  stakeholder
    .command("apply")
    .description("Replace the stakeholder description body from content piped via stdin")
    .argument("<name>")
    .action((name: string) =>
      runCommand(() => applyStakeholderBody({ name, body: readStdin() }), (result) => entityMutationPayload(result)),
    );

  const goal = program.command("goal").description("Create, list, show, promote, and reject goals");
  goal
    .command("create")
    .requiredOption("--actor <name>")
    .requiredOption("--description <text>")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1")
    .action((options: { actor: string; description: string; level?: string; priority?: string }) =>
      runCommand(() => createGoal(options), (result) => entityPayload(result, `vspec goal promote ${result.id}`)),
    );
  goal
    .command("list")
    .option("--actor <actor>")
    .option("--status <status>")
    .action((options: { actor?: string; status?: string }) =>
      runCommand(() => listGoals(options), (data) => ({ data, suggestedNextActions: [{ command: "vspec goal show <G-NNN>" }] })),
    );
  goal
    .command("show")
    .argument("<id>")
    .action((id: string) =>
      runCommand(() => showGoal({ id }), (data) => ({ data, suggestedNextActions: [{ command: `vspec goal promote ${id}` }] })),
    );
  goal
    .command("promote")
    .argument("<id>")
    .action((id: string) =>
      runCommand(() => promoteGoal({ id }), (data) => ({
        data,
        affectedFiles: data.affectedFiles.map((path) => ({ path })),
        suggestedNextActions: [{ command: `vspec doctor ${data.key}` }],
      })),
    );
  goal
    .command("reject")
    .argument("<id>")
    .action((id: string) =>
      runCommand(() => rejectGoal({ id }), (data) => ({ data, suggestedNextActions: [{ command: "vspec goal list" }] })),
    );

  const exportCommand = program.command("export").description("Export use cases");
  exportCommand
    .command("gherkin")
    .argument("<key>")
    .option("--output <path>")
    .action((key: string, options: { output?: string }) =>
      runCommand(() => exportGherkin({ key, output: options.output }), (result) => ({
        data: result.text,
        affectedFiles: [{ path: result.path }],
        suggestedNextActions: [{ command: `git add ${result.path}`, reason: "Stage the exported feature when ready." }],
      })),
    );

  return program;
}

function suggestDoctorActions(findings: { rule: string; message: string }[]) {
  const actions: { command: string; reason?: string }[] = [];
  const seen = new Set<string>();
  // Point at the list command (which prints real slugs) rather than synthesizing
  // a `--name <slug>` from a display name — that produced broken commands like
  // `--name -` for Korean names and pushed agents to create junk entities when
  // the actual fix was to reference an existing slug.
  const add = (command: string, reason: string) => {
    if (seen.has(command)) return;
    seen.add(command);
    actions.push({ command, reason });
  };
  for (const finding of findings) {
    if (/actor .+? does not exist/i.test(finding.message)) {
      add("vspec actor list", "Reference an existing actor by its slug (not its display name), or create it.");
    }
    if (/stakeholder .+? does not exist/i.test(finding.message)) {
      add("vspec stakeholder list", "Reference an existing stakeholder by its slug (not its display name), or create it.");
    }
  }
  add("vspec doctor", "Re-run validation after fixes.");
  return actions;
}

function runCommand<T>(
  fn: () => T,
  payload: (data: T) => {
    data: unknown;
    affectedFiles?: { path: string }[];
    warnings?: { message: string }[];
    suggestedNextActions: { command: string; reason?: string }[];
  },
) {
  try {
    outputSuccess(payload(fn()));
  } catch (error) {
    const info = errorInfo(error);
    outputError({ code: info.code, message: info.message, details: info.details, actions: info.actions });
  }
}

function entityPayload<T extends { path: string }>(data: T, next: string) {
  return { data, affectedFiles: [{ path: data.path }], suggestedNextActions: [{ command: next, reason: "Continue authoring." }] };
}

function mutationPayload<T extends { path: string }>(data: T, key: string) {
  return {
    data,
    affectedFiles: [{ path: data.path }],
    suggestedNextActions: [{ command: `vspec doctor ${key}`, reason: "Validate after the edit." }],
  };
}

function entityMutationPayload<T extends { path: string }>(data: T) {
  return {
    data,
    affectedFiles: [{ path: data.path }],
    suggestedNextActions: [{ command: "vspec doctor", reason: "Re-validate specs after the edit." }],
  };
}

function readStdin(): string {
  if (process.stdin.isTTY) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      "vspec usecase apply reads the content from stdin. Pipe it in, e.g. `vspec usecase apply VSPEC-001 --section notes <<'EOF'\\n...\\nEOF` or `cat body.md | vspec usecase apply VSPEC-001`.",
    );
  }
  return readFileSync(0, "utf8");
}

// apply is the authoring boundary: after writing, validate inline so the agent
// sees findings without a separate doctor call.
function applyPayload<T extends { path: string }>(data: T, key: string, wholeBody: boolean) {
  const { findings, promotable } = runDoctor({ target: key });
  const errors = findings.filter((finding) => finding.level === "error");
  const actions = [
    {
      command: `vspec doctor ${key}`,
      reason: errors.length > 0 ? `${errors.length} validation error(s) to fix.` : "Validate after the edit.",
    },
  ];
  if (wholeBody) {
    actions.push({
      command: `vspec usecase apply ${key} --section main-success`,
      reason: "For later edits, replace one --section at a time — fewer tokens and no risk of clobbering other sections.",
    });
  }
  if (promotable.length > 0) {
    actions.push({
      command: `vspec usecase set ${key} --field format --value FULLY_DRESSED`,
      reason: "All required sections are present — promote from BRIEF/CASUAL to FULLY_DRESSED.",
    });
  }
  return {
    data,
    affectedFiles: [{ path: data.path }],
    warnings: findings.map((finding) => ({ message: `${finding.level}: ${finding.message}` })),
    suggestedNextActions: actions,
  };
}

// exitOverride only propagates to subcommands created after it is called, so we
// apply it (and a suppressed writeErr) to every command in the tree. This lets
// run() catch commander's own parse failures (unknown option, missing argument)
// and re-emit them as the agent envelope — the agent never sees a raw
// "error: unknown option" line on stderr.
function catchParseErrors(command: Command) {
  command.exitOverride();
  command.configureOutput({ writeErr: () => {} });
  for (const sub of command.commands) catchParseErrors(sub);
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  catchParseErrors(program);
  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = error as { code?: string; exitCode?: number; message?: string };
    // Help and version are informational exits commander already wrote to stdout.
    if (err.code === "commander.helpDisplayed" || err.code === "commander.help" || err.code === "commander.version") {
      return;
    }
    const raw = (err.message ?? "Invalid command invocation.").replace(/^error:\s*/i, "");
    const message = /--format\b/.test(raw)
      ? "vspec no longer accepts --format; it always prints the agent JSON envelope. Re-run without --format and read `.data` and `.suggested_next_actions` from the output."
      : raw;
    outputError({
      code: "INVALID_ARGUMENT",
      message,
      actions: [{ command: "vspec ai-guide", reason: "Review command usage and valid options." }],
    });
  }
}

// Direct execution (`tsx src/cli.ts`). The bin wrapper imports and calls run()
// explicitly, so it must not depend on this guard matching under dynamic import.
if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
