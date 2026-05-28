#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./validate/doctor.js";
import { buildErrorEnvelope, buildOkEnvelope } from "./envelope.js";
import { projectKey } from "./files.js";
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

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vspec")
    .description("Local-first Cockburn use-case specs")
    .version("0.1.0")
    .option("--format <format>", "output format: human|json|agent", "human");

  program
    .command("init")
    .description("Create .vspec/config.json and specs directories")
    .option("--key <prefix>", "use-case key prefix")
    .action((options: { key?: string }) => {
      const result = initProject({ key: options.key });
      console.log(`Initialized ${result.key_prefix}.`);
    });

  program
    .command("doctor")
    .description("Validate specs offline")
    .argument("[target]", "use-case key or path")
    .action((target: string | undefined) => {
      const format = program.opts().format as "human" | "json" | "agent";
      const result = runDoctor({ target });
      const errors = result.findings.filter((finding) => finding.level === "error");
      const warnings = result.findings.filter((finding) => finding.level === "warn");
      const data = { files: result.files, findings: result.findings };

      if (format === "agent") {
        if (errors.length > 0) {
          console.log(
            JSON.stringify(
              buildErrorEnvelope({
                error: {
                  code: "VALIDATION_FAILED",
                  message: `${errors.length} validation error(s).`,
                  details: { findings: result.findings },
                },
                context: { project_key: projectKey() },
                suggestedNextActions: suggestDoctorActions(result.findings),
                warnings: warnings.map((finding) => ({ message: finding.message })),
              }),
              null,
              2,
            ),
          );
          process.exitCode = 1;
          return;
        }
        console.log(
          JSON.stringify(
            buildOkEnvelope({
              data,
              context: { project_key: projectKey() },
              suggestedNextActions: [{ command: "vspec export gherkin <KEY>", reason: "Export validated use cases." }],
              warnings: warnings.map((finding) => ({ message: finding.message })),
            }),
            null,
            2,
          ),
        );
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
  usecase
    .command("create")
    .requiredOption("--title <title>", "use-case title")
    .requiredOption("--primary-actor <name>", "primary actor name")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1")
    .option("--from <goal>", "source goal id")
    .action((options: { title: string; primaryActor: string; level: string; priority: string; from?: string }) => {
      try {
        const created = createUseCase(options);
        console.log(`${created.key} ${created.path}`);
      } catch (error) {
        handleCliError(error);
      }
    });
  usecase
    .command("list")
    .option("--status <status>")
    .option("--actor <actor>")
    .option("--level <level>")
    .option("--q <query>")
    .action((options: { status?: string; actor?: string; level?: string; q?: string }) => {
      try {
        for (const item of listUseCases(options)) {
          console.log(`${item.key}\t${item.title}\t${item.level}\t${item.status}`);
        }
      } catch (error) {
        handleCliError(error);
      }
    });
  usecase
    .command("show")
    .argument("<key>", "use-case key")
    .action((key: string) => {
      try {
        const shown = showUseCase({ key });
        console.log(JSON.stringify(shown.useCase, null, 2));
      } catch (error) {
        handleCliError(error);
      }
    });
  usecase
    .command("set")
    .argument("<key>")
    .requiredOption("--field <name>")
    .requiredOption("--value <value>")
    .action((key: string, options: { field: string; value: string }) => runCommand(() => setUseCaseField({ key, ...options })));
  usecase
    .command("add-stakeholder")
    .argument("<key>")
    .requiredOption("--stakeholder <name>")
    .requiredOption("--interest <text>")
    .option("--protected-by <ref>")
    .action((key: string, options: { stakeholder: string; interest: string; protectedBy?: string }) =>
      runCommand(() => addStakeholderInterest({ key, ...options })),
    );

  const actor = program.command("actor").description("Create, list, and show actors");
  actor
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "primary|supporting|offstage", "primary")
    .option("--human", "actor is human")
    .option("--alias <alias...>")
    .action((options: { name: string; displayName?: string; type?: string; human?: boolean; alias?: string[] }) =>
      runCommand(() => createActor(options)),
    );
  actor.command("list").action(() => runCommand(() => listActors({})));
  actor.command("show").argument("<name>").action((name: string) => runCommand(() => showActor({ name })));

  const stakeholder = program.command("stakeholder").description("Create, list, and show stakeholders");
  stakeholder
    .command("create")
    .requiredOption("--name <name>")
    .option("--display-name <displayName>")
    .option("--type <type>", "internal|external|regulatory", "internal")
    .action((options: { name: string; displayName?: string; type?: string }) => runCommand(() => createStakeholder(options)));
  stakeholder.command("list").action(() => runCommand(() => listStakeholders({})));
  stakeholder.command("show").argument("<name>").action((name: string) => runCommand(() => showStakeholder({ name })));

  const goal = program.command("goal").description("Create, list, show, promote, and reject goals");
  goal
    .command("create")
    .requiredOption("--actor <name>")
    .requiredOption("--description <text>")
    .option("--level <level>", "summary|user-goal|subfunction", "user-goal")
    .option("--priority <priority>", "p0|p1|p2|p3", "p1")
    .action((options: { actor: string; description: string; level?: string; priority?: string }) => runCommand(() => createGoal(options)));
  goal
    .command("list")
    .option("--actor <actor>")
    .option("--status <status>")
    .action((options: { actor?: string; status?: string }) => runCommand(() => listGoals(options)));
  goal.command("show").argument("<id>").action((id: string) => runCommand(() => showGoal({ id })));
  goal.command("promote").argument("<id>").action((id: string) => runCommand(() => promoteGoal({ id })));
  goal.command("reject").argument("<id>").action((id: string) => runCommand(() => rejectGoal({ id })));

  const scenario = program.command("scenario").description("Mutate use-case scenarios");
  scenario
    .command("add")
    .argument("<key>")
    .requiredOption("--type <type>")
    .option("--at <point>")
    .option("--condition <text>")
    .option("--outcome <outcome>")
    .action((key: string, options: { type: string; at?: string; condition?: string; outcome?: string }) =>
      runCommand(() => addScenario({ key, ...options })),
    );

  const step = program.command("step").description("Mutate use-case steps");
  step
    .command("add")
    .argument("<key>")
    .option("--scenario <scenario>", "main|<point>", "main")
    .requiredOption("--actor <name>")
    .requiredOption("--action <text>")
    .action((key: string, options: { scenario?: string; actor: string; action: string }) => runCommand(() => addStep({ key, ...options })));
  step
    .command("edit")
    .argument("<key>")
    .requiredOption("--step <step>")
    .option("--actor <name>")
    .option("--action <text>")
    .action((key: string, options: { step: string; actor?: string; action?: string }) => runCommand(() => editStep({ key, ...options })));

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

function handleCliError(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_ARGUMENT";
  if (code === "NOT_INITIALIZED") console.error("No .vspec/config.json found. Run `vspec init` first.");
  else if (code === "KEY_NOT_FOUND") console.error("No use case found for that key.");
  else if (code === "GOAL_NOT_FOUND") console.error("No goal found for that id.");
  else console.error(code);
  process.exitCode = 1;
}

function runCommand<T>(fn: () => T) {
  try {
    const result = fn();
    if (typeof result === "object") console.log(JSON.stringify(result, null, 2));
    else console.log(String(result));
  } catch (error) {
    handleCliError(error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildProgram().parseAsync(process.argv);
}
