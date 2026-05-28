#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./validate/doctor.js";
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
import { addScenario, addStakeholderInterest, addStep, editStep, setUseCaseField } from "./mutators.js";
import { addFormatOption, errorInfo, formatFrom, outputError, outputSuccess, type OutputFormat } from "./output.js";
import { aiGuideText } from "./ai-guide.js";
import { exportGherkin } from "./export/gherkin.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vspec")
    .description("Local-first Cockburn use-case specs")
    .version("0.1.0")
    .option("--format <format>", "output format: human|json|agent");

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
      const data = { files: result.files, findings: result.findings };

      if (format === "agent") {
        if (errors.length > 0) {
          outputError(format, {
            code: "VALIDATION_FAILED",
            message: `${errors.length} validation error(s).`,
            details: { findings: result.findings },
            actions: suggestDoctorActions(result.findings),
          });
          return;
        }
        outputSuccess(format, {
          data,
          suggestedNextActions: [{ command: "vspec export gherkin <KEY>", reason: "Export validated use cases." }],
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
        suggestedNextActions: [
          { command: `vspec doctor ${created.key}`, reason: "Validate before committing." },
          { command: `vspec usecase add-stakeholder ${created.key} --stakeholder project-team --interest "..."`, reason: "Add more interests." },
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
    .command("add-stakeholder")
    .argument("<key>")
    .requiredOption("--stakeholder <name>", "stakeholder name (must exist in specs/stakeholders)")
    .requiredOption("--interest <text>", "what this stakeholder wants to be true on success")
    .option("--protected-by <ref>", "step ref or guarantee that protects this interest"))
    .action((key: string, options: { stakeholder: string; interest: string; protectedBy?: string; format?: string }) =>
      runCommand(options, () => addStakeholderInterest({ key, ...options }), (result) => mutationPayload(result, key)),
    );

  const actor = program.command("actor").description("Create, list, and show actors");
  addFormatOption(actor
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "primary|supporting|offstage", "primary")
    .option("--human", "actor is human")
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
      runCommand(options, () => createStakeholder(options), (result) => entityPayload(result, "vspec usecase add-stakeholder <KEY> --stakeholder " + result.name)),
    );
  addFormatOption(stakeholder.command("list")).action((options: { format?: string }) =>
    runCommand(options, () => listStakeholders({}), (data) => ({ data, suggestedNextActions: [{ command: "vspec stakeholder show <name>" }] })),
  );
  addFormatOption(stakeholder.command("show").argument("<name>")).action((name: string, options: { format?: string }) =>
    runCommand(options, () => showStakeholder({ name }), (data) => ({ data, suggestedNextActions: [{ command: "vspec usecase add-stakeholder <KEY> --stakeholder " + name }] })),
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

  const scenario = program.command("scenario").description("Mutate use-case scenarios");
  addFormatOption(scenario
    .command("add")
    .argument("<key>")
    .requiredOption("--type <type>", "main-success|extension")
    .option("--at <point>", "extension point id, e.g. 3a or *a (digit = the main step it branches from)")
    .option("--condition <text>", "the deviation/condition that triggers this extension")
    .option("--outcome <outcome>", "success|failure|partial (default: failure)"))
    .action((key: string, options: { type: string; at?: string; condition?: string; outcome?: string; format?: string }) =>
      runCommand(options, () => addScenario({ key, ...options }), (result) => mutationPayload(result, key)),
    );

  const step = program.command("step").description("Mutate use-case steps");
  addFormatOption(step
    .command("add")
    .argument("<key>")
    .option("--scenario <scenario>", "main|<point>", "main")
    .requiredOption("--actor <name>", "actor name (must exist in specs/actors)")
    .requiredOption("--action <text>", "verb phrase, e.g. \"validates the payment\""))
    .action((key: string, options: { scenario?: string; actor: string; action: string; format?: string }) =>
      runCommand(options, () => addStep({ key, ...options }), (result) => mutationPayload(result, key)),
    );
  addFormatOption(step
    .command("edit")
    .argument("<key>")
    .requiredOption("--step <step>", "main step number (e.g. 2) or extension step id (e.g. 3a1)")
    .option("--actor <name>", "new actor name")
    .option("--action <text>", "new verb phrase"))
    .action((key: string, options: { step: string; actor?: string; action?: string; format?: string }) =>
      runCommand(options, () => editStep({ key, ...options }), (result) => mutationPayload(result, key)),
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
  const actions = [{ command: "vspec doctor", reason: "Re-run validation after fixes." }];
  for (const finding of findings) {
    const actor = finding.message.match(/Actor (.+?) (?:in step|does not exist)/)?.[1];
    if (actor) actions.unshift({ command: `vspec actor create --name ${actor}`, reason: "Create the missing actor." });
    const stakeholder = finding.message.match(/Stakeholder (.+?) does not exist/)?.[1];
    if (stakeholder) {
      actions.unshift({
        command: `vspec stakeholder create --name ${stakeholder.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        reason: "Create the missing stakeholder.",
      });
    }
  }
  return actions;
}

function runCommand<T>(
  options: { format?: string } | undefined,
  fn: () => T,
  payload: (data: T) => { data: unknown; human?: string; affectedFiles?: { path: string }[]; suggestedNextActions: { command: string; reason?: string }[] },
) {
  try {
    const result = fn();
    outputSuccess(formatFrom(options), payload(result));
  } catch (error) {
    const info = errorInfo(error);
    outputError(formatFrom(options), { code: info.code, message: info.message, actions: info.actions });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildProgram().parseAsync(process.argv);
}
