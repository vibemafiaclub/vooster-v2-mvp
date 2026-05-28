import type { Command } from "commander";
import { buildErrorEnvelope, buildOkEnvelope } from "./envelope.js";
import { projectKey } from "./files.js";
import type { AgentAction } from "./domain/types.js";

export type OutputFormat = "human" | "json" | "agent";

export type CommandPayload<T> = {
  data: T;
  affectedFiles?: { path: string }[];
  suggestedNextActions: AgentAction[];
  warnings?: { message: string }[];
  human?: string;
};

export function addFormatOption<T extends Command>(command: T): T {
  return command.option("--format <format>", "output format: human|json|agent");
}

export function outputSuccess<T>(format: OutputFormat, payload: CommandPayload<T>) {
  if (format === "agent") {
    console.log(
      JSON.stringify(
        buildOkEnvelope({
          data: payload.data,
          context: { project_key: projectKey() },
          affectedFiles: payload.affectedFiles ?? inferAffectedFiles(payload.data),
          suggestedNextActions: payload.suggestedNextActions,
          warnings: payload.warnings ?? [],
        }),
        null,
        2,
      ),
    );
  } else if (format === "json") {
    console.log(JSON.stringify(payload.data, null, 2));
  } else {
    console.log(payload.human ?? humanize(payload.data));
  }
}

export function outputError(format: OutputFormat, args: { code: string; message: string; details?: Record<string, unknown>; actions?: AgentAction[] }) {
  if (format === "agent") {
    console.log(
      JSON.stringify(
        buildErrorEnvelope({
          error: { code: args.code, message: args.message, details: args.details },
          context: { project_key: projectKey() },
          suggestedNextActions: args.actions ?? defaultActions(args.code),
        }),
        null,
        2,
      ),
    );
  } else if (format === "json") {
    console.error(JSON.stringify({ error: { code: args.code, message: args.message, details: args.details } }, null, 2));
  } else {
    console.error(args.message);
  }
  process.exitCode = 1;
}

export function formatFrom(options: { format?: string } | undefined): OutputFormat {
  const format = options?.format ?? formatFromArgv() ?? "human";
  if (format === "human" || format === "json" || format === "agent") return format;
  return "human";
}

export function errorInfo(error: unknown): { code: string; message: string; actions: AgentAction[] } {
  const code = error instanceof Error ? error.message : "INVALID_ARGUMENT";
  if (code === "NOT_INITIALIZED") {
    return { code, message: "No .vspec/config.json found.", actions: [{ command: "vspec init", reason: "Initialize this repo." }] };
  }
  if (code === "KEY_NOT_FOUND") {
    return { code, message: "No use case found for that key.", actions: [{ command: "vspec usecase list", reason: "See available keys." }] };
  }
  if (code === "ACTOR_NOT_FOUND") {
    return { code, message: "No actor found for that name.", actions: [{ command: "vspec actor list", reason: "See available actors." }] };
  }
  if (code === "STAKEHOLDER_NOT_FOUND") {
    return {
      code,
      message: "No stakeholder found for that name.",
      actions: [{ command: "vspec stakeholder list", reason: "See available stakeholders." }],
    };
  }
  if (code === "GOAL_NOT_FOUND") {
    return { code, message: "No goal found for that id.", actions: [{ command: "vspec goal list", reason: "See available goals." }] };
  }
  if (code === "ALREADY_EXISTS") {
    return { code, message: "The target file already exists.", actions: [{ command: "vspec doctor", reason: "Inspect current specs." }] };
  }
  return { code: "INVALID_ARGUMENT", message: code, actions: [{ command: "vspec ai-guide", reason: "Review command usage." }] };
}

function inferAffectedFiles(data: unknown): { path: string }[] {
  if (data && typeof data === "object") {
    const record = data as { path?: unknown; affectedFiles?: unknown };
    if (Array.isArray(record.affectedFiles)) return record.affectedFiles.map((path) => ({ path: String(path) }));
    if (typeof record.path === "string") return [{ path: record.path }];
  }
  return [];
}

function humanize(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

function defaultActions(code: string): AgentAction[] {
  if (code === "KEY_NOT_FOUND") return [{ command: "vspec usecase list", reason: "See available keys." }];
  return [{ command: "vspec ai-guide", reason: "See the end-to-end workflow." }];
}

function formatFromArgv(): string | null {
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--format") return process.argv[index + 1] ?? null;
    if (arg?.startsWith("--format=")) return arg.slice("--format=".length);
  }
  return null;
}
