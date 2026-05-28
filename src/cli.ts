#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./validate/doctor.js";
import { buildErrorEnvelope, buildOkEnvelope } from "./envelope.js";
import { projectKey } from "./files.js";
import { initProject } from "./project.js";
import { createUseCase, listUseCases, showUseCase } from "./usecase-commands.js";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildProgram().parseAsync(process.argv);
}
