#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { looksLikeVerbPhrase, runDoctor } from "./validate/doctor.js";
import { VspecError } from "./errors.js";
import { initProject } from "./project.js";
import { createUseCase, listUseCases, showUseCase } from "./usecase-commands.js";
import {
  createActor,
  createGoal,
  createStakeholder,
  listActors,
  listGoals,
  listStakeholders,
  promoteGoal,
  rejectGoal,
  showActor,
  showGoal,
  showStakeholder,
} from "./entity-commands.js";
import { applyUseCaseBody, applyUseCaseSection, setUseCaseField } from "./mutators.js";
import { BODY_SECTIONS } from "./format/parse.js";
import { addFormatOption, errorInfo, formatFrom, outputError, outputSuccess } from "./output.js";
import { aiGuideText } from "./ai-guide.js";
import { exportGherkin } from "./export/gherkin.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vspec")
    .description("Local-first Cockburn use-case specs")
    .version("0.1.0")
    .option("--format <format>", "output format: agent|json|human (default: agent)");

  addFormatOption(program
    .command("init")
    .description("Create .vspec/config.json and specs directories")
    .option("--key <prefix>", "use-case key prefix"))
    .action((options: { key?: string; format?: string }) =>
      runCommand(options, () => initProject({ key: options.key }), (result) => ({
        data: result,
        human: `Initialized ${result.key_prefix}.`,
        affectedFiles: result.affectedFiles.map((path) => ({ path })),
        suggestedNextActions: [
          { command: "vspec actor create --name developer", reason: "Add the primary actor." },
          { command: "vspec usecase create --title \"...\" --primary-actor developer", reason: "Create the first use case." },
        ],
      })),
    );

  addFormatOption(program.command("ai-guide").description("Print an end-to-end authoring guide")).action((options: { format?: string }) => {
    const guide = aiGuideText();
    outputSuccess(formatFrom(options), {
      data: { guide },
      human: guide,
      suggestedNextActions: [{ command: "vspec init --key VSPEC", reason: "Start the workflow." }],
    });
  });

  addFormatOption(program
    .command("doctor")
    .description("Validate specs offline")
    .argument("[target]", "use-case key or path"))
    .action((target: string | undefined, options: { format?: string }) => {
      const format = formatFrom(options);
      const result = runDoctor({ target });
      const errors = result.findings.filter((finding) => finding.level === "error");
      const warnings = result.findings.filter((finding) => finding.level === "warn");
      const summary = { errors: errors.length, warnings: warnings.length };
      const data = { files: result.files, summary, findings: result.findings };

      if (format === "agent") {
        if (errors.length > 0) {
          outputError(format, {
            code: "VALIDATION_FAILED",
            message: `${errors.length} validation error(s).`,
            details: { summary, findings: result.findings },
            actions: suggestDoctorActions(result.findings),
          });
          return;
        }
        const reviewWarnings =
          warnings.length > 0
            ? [{ command: `vspec doctor${target ? ` ${target}` : ""} --format=human`, reason: `${warnings.length} warning(s) to review before export.` }]
            : [];
        outputSuccess(format, {
          data,
          suggestedNextActions: [...reviewWarnings, { command: "vspec export gherkin <KEY>", reason: "Export validated use cases." }],
          warnings: warnings.map((finding) => ({ message: finding.message })),
        });
        return;
      }

      if (format === "json") {
        console.log(JSON.stringify(data, null, 2));
      } else if (errors.length === 0) {
        console.log(`No errors. ${warnings.length} warning(s).`);
      } else {
        for (const finding of result.findings) {
          console.error(`${finding.level.toUpperCase()} ${finding.rule}: ${finding.message}`);
        }
      }
      if (errors.length > 0) process.exitCode = 1;
    });

  const usecase = program.command("usecase").description("Create, list, and show use cases");
  addFormatOption(usecase
    .command("create")
    .requiredOption("--title <title>", "use-case title")
    .requiredOption("--primary-actor <name>", "primary actor name")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1")
    .option("--from <goal>", "source goal id"))
    .action((options: { title: string; primaryActor: string; level: string; priority: string; from?: string; format?: string }) =>
      runCommand(options, () => createUseCase(options), (created) => ({
        data: created,
        human: `${created.key} ${created.path}`,
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
  addFormatOption(usecase
    .command("list")
    .option("--status <status>")
    .option("--actor <actor>")
    .option("--level <level>")
    .option("--q <query>"))
    .action((options: { status?: string; actor?: string; level?: string; q?: string; format?: string }) =>
      runCommand(options, () => listUseCases(options), (items) => ({
        data: items,
        human: items.map((item) => `${item.key}\t${item.title}\t${item.level}\t${item.status}`).join("\n"),
        suggestedNextActions: [{ command: "vspec usecase show <KEY>", reason: "Inspect a use case." }],
      })),
    );
  addFormatOption(usecase
    .command("show")
    .argument("<key>", "use-case key"))
    .action((key: string, options: { format?: string }) =>
      runCommand(options, () => showUseCase({ key }), (shown) => ({
        data: shown.useCase,
        human: JSON.stringify(shown.useCase, null, 2),
        suggestedNextActions: [{ command: `vspec doctor ${key}`, reason: "Validate this use case." }],
      })),
    );
  addFormatOption(usecase
    .command("set")
    .argument("<key>")
    .requiredOption("--field <name>", "title|level|format|status|priority|scope|frequency")
    .requiredOption("--value <value>", "new value (validated against the field)"))
    .action((key: string, options: { field: string; value: string; format?: string }) =>
      runCommand(options, () => setUseCaseField({ key, ...options }), (result) => mutationPayload(result, key)),
    );
  addFormatOption(usecase
    .command("apply")
    .description("Replace the body (or one --section) from content piped via stdin")
    .argument("<key>", "use-case key")
    .option("--section <name>", `one of: ${BODY_SECTIONS.join("|")} (omit to replace the whole body)`))
    .action((key: string, options: { section?: string; format?: string }) =>
      runCommand(options, () => {
        const input = readStdin();
        if (options.section) return applyUseCaseSection({ key, section: options.section, content: input });
        if (input.trim().length === 0) {
          throw new VspecError(
            "INVALID_ARGUMENT",
            "Whole-body apply needs the full use-case body on stdin. To clear a single section instead, use --section <name>.",
          );
        }
        return applyUseCaseBody({ key, body: input });
      }, (result) => applyPayload(result, key)),
    );

  const actor = program.command("actor").description("Create, list, and show actors");
  addFormatOption(actor
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "primary|supporting|offstage", "primary")
    .option("--human", "force the actor human (default: human for primary, non-human otherwise)")
    .option("--no-human", "force the actor non-human")
    .option("--alias <alias...>"))
    .action((options: { name: string; displayName?: string; type?: string; human?: boolean; alias?: string[]; format?: string }) =>
      runCommand(options, () => createActor(options), (result) => entityPayload(result, "vspec usecase create --title \"...\" --primary-actor " + result.name)),
    );
  addFormatOption(actor.command("list")).action((options: { format?: string }) =>
    runCommand(options, () => listActors({}), (data) => ({ data, suggestedNextActions: [{ command: "vspec actor show <name>" }] })),
  );
  addFormatOption(actor.command("show").argument("<name>")).action((name: string, options: { format?: string }) =>
    runCommand(options, () => showActor({ name }), (data) => ({ data, suggestedNextActions: [{ command: "vspec usecase create --title \"...\" --primary-actor " + name }] })),
  );

  const stakeholder = program.command("stakeholder").description("Create, list, and show stakeholders");
  addFormatOption(stakeholder
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "internal|external|regulatory", "internal"))
    .action((options: { name: string; displayName?: string; type?: string; format?: string }) =>
      runCommand(options, () => createStakeholder(options), (result) => entityPayload(result, "vspec usecase apply <KEY> --section stakeholders")),
    );
  addFormatOption(stakeholder.command("list")).action((options: { format?: string }) =>
    runCommand(options, () => listStakeholders({}), (data) => ({ data, suggestedNextActions: [{ command: "vspec stakeholder show <name>" }] })),
  );
  addFormatOption(stakeholder.command("show").argument("<name>")).action((name: string, options: { format?: string }) =>
    runCommand(options, () => showStakeholder({ name }), (data) => ({ data, suggestedNextActions: [{ command: "vspec usecase apply <KEY> --section stakeholders" }] })),
  );

  const goal = program.command("goal").description("Create, list, show, promote, and reject goals");
  addFormatOption(goal
    .command("create")
    .requiredOption("--actor <name>")
    .requiredOption("--description <text>")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1"))
    .action((options: { actor: string; description: string; level?: string; priority?: string; format?: string }) =>
      runCommand(options, () => createGoal(options), (result) => entityPayload(result, `vspec goal promote ${result.id}`)),
    );
  addFormatOption(goal
    .command("list")
    .option("--actor <actor>")
    .option("--status <status>"))
    .action((options: { actor?: string; status?: string; format?: string }) =>
      runCommand(options, () => listGoals(options), (data) => ({ data, suggestedNextActions: [{ command: "vspec goal show <G-NNN>" }] })),
    );
  addFormatOption(goal.command("show").argument("<id>")).action((id: string, options: { format?: string }) =>
    runCommand(options, () => showGoal({ id }), (data) => ({ data, suggestedNextActions: [{ command: `vspec goal promote ${id}` }] })),
  );
  addFormatOption(goal.command("promote").argument("<id>")).action((id: string, options: { format?: string }) =>
    runCommand(options, () => promoteGoal({ id }), (data) => ({
      data,
      affectedFiles: data.affectedFiles.map((path) => ({ path })),
      suggestedNextActions: [{ command: `vspec doctor ${data.key}` }],
    })),
  );
  addFormatOption(goal.command("reject").argument("<id>")).action((id: string, options: { format?: string }) =>
    runCommand(options, () => rejectGoal({ id }), (data) => ({ data, suggestedNextActions: [{ command: "vspec goal list" }] })),
  );

  const exportCommand = program.command("export").description("Export use cases");
  addFormatOption(exportCommand.command("gherkin").argument("<key>").option("--output <path>")).action(
    (key: string, options: { output?: string; format?: string }) =>
      runCommand(options, () => exportGherkin({ key, output: options.output }), (result) => ({
        data: result.text,
        human: result.path,
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
  options: { format?: string } | undefined,
  fn: () => T,
  payload: (data: T) => {
    data: unknown;
    human?: string;
    affectedFiles?: { path: string }[];
    warnings?: { message: string }[];
    suggestedNextActions: { command: string; reason?: string }[];
  },
) {
  try {
    const result = fn();
    outputSuccess(formatFrom(options), payload(result));
  } catch (error) {
    const info = errorInfo(error);
    outputError(formatFrom(options), { code: info.code, message: info.message, details: info.details, actions: info.actions });
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
function applyPayload<T extends { path: string }>(data: T, key: string) {
  const { findings } = runDoctor({ target: key });
  const errors = findings.filter((finding) => finding.level === "error");
  return {
    data,
    affectedFiles: [{ path: data.path }],
    warnings: findings.map((finding) => ({ message: `${finding.level}: ${finding.message}` })),
    suggestedNextActions: [
      {
        command: `vspec doctor ${key}`,
        reason: errors.length > 0 ? `${errors.length} validation error(s) to fix.` : "Validate after the edit.",
      },
    ],
  };
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Direct execution (`tsx src/cli.ts`). The bin wrapper imports and calls run()
// explicitly, so it must not depend on this guard matching under dynamic import.
if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
