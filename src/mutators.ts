import { readFileSync, writeFileSync } from "node:fs";
import { findUseCaseFile, readConfig, relativePath } from "./files.js";
import { parseUseCaseMarkdown } from "./format/parse.js";
import { serializeUseCase } from "./format/serialize.js";
import { slugify } from "./slug.js";
import { VspecError } from "./errors.js";
import type { ExtensionOutcome, ParsedUseCase } from "./domain/types.js";

const EXTENSION_POINT = /^(\d+[a-z]|\*[a-z])$/i;

export function setUseCaseField(args: { key: string; field: string; value: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    const field = args.field as keyof ParsedUseCase["frontmatter"];
    if (!(field in useCase.frontmatter)) throw new Error("INVALID_ARGUMENT");
    (useCase.frontmatter as Record<string, unknown>)[field] = normalizeFrontmatterValue(args.field, args.value);
    if (args.field === "title") useCase.title = args.value;
  });
}

export function addStakeholderInterest(args: { key: string; stakeholder: string; interest: string; protectedBy?: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    useCase.stakeholderInterests.push({
      stakeholder: displayNameOrRaw(args.stakeholder),
      interest: args.interest,
      protectionMechanism: args.protectedBy ?? null,
    });
  });
}

export function addScenario(args: { key: string; type: string; at?: string; condition?: string; outcome?: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    if (args.type === "main-success") return;
    if (args.type !== "extension") {
      throw new VspecError("INVALID_ARGUMENT", `Unknown --type "${args.type}". Use one of: main-success, extension.`);
    }
    if (args.at !== undefined && !EXTENSION_POINT.test(args.at)) {
      throw new VspecError(
        "INVALID_ARGUMENT",
        `Invalid --at "${args.at}". Use an extension point id like 3a or *a (the leading digit is the main step it branches from, * means any step).`,
      );
    }
    const point = args.at ?? `${Math.max(1, useCase.mainSuccess.length)}a`;
    useCase.extensions.push({
      point,
      condition: args.condition ?? "Alternative condition",
      steps: [],
      outcome: parseOutcome(args.outcome ?? "failure"),
      rejoinStep: null,
    });
  });
}

export function addStep(args: { key: string; scenario?: string; actor: string; action: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    const scenario = args.scenario ?? "main";
    if (scenario === "main" || scenario === "main-success") {
      useCase.mainSuccess.push({ number: useCase.mainSuccess.length + 1, actor: slugify(args.actor), action: ensurePeriod(args.action) });
      return;
    }
    const extension = useCase.extensions.find((item) => item.point === scenario);
    if (!extension) {
      const points = useCase.extensions.map((item) => item.point).join(", ") || "none yet";
      throw new VspecError(
        "INVALID_ARGUMENT",
        `Unknown --scenario "${scenario}". Use "main" or an existing extension point (have: ${points}). Create the extension first with: vspec scenario add ${args.key} --type extension --at ${scenario}.`,
      );
    }
    extension.steps.push({ id: `${extension.point}${extension.steps.length + 1}`, actor: slugify(args.actor), action: ensurePeriod(args.action) });
  });
}

export function editStep(args: { key: string; step: string; actor?: string; action?: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    const mainNumber = Number(args.step);
    if (Number.isFinite(mainNumber)) {
      const step = useCase.mainSuccess[mainNumber - 1];
      if (!step) throw new Error("KEY_NOT_FOUND");
      if (args.actor) step.actor = slugify(args.actor);
      if (args.action) step.action = ensurePeriod(args.action);
      return;
    }
    for (const extension of useCase.extensions) {
      const step = extension.steps.find((item) => item.id === args.step);
      if (step) {
        if (args.actor) step.actor = slugify(args.actor);
        if (args.action) step.action = ensurePeriod(args.action);
        return;
      }
    }
    throw new Error("KEY_NOT_FOUND");
  });
}

function updateUseCase(cwd: string | undefined, key: string, mutate: (useCase: ParsedUseCase) => void) {
  const config = readConfig(cwd ?? process.cwd());
  if (!config) throw new Error("NOT_INITIALIZED");
  const path = findUseCaseFile(config.root, key);
  if (!path) throw new Error("KEY_NOT_FOUND");
  const useCase = parseUseCaseMarkdown(readFileSync(path, "utf8"));
  mutate(useCase);
  writeFileSync(path, serializeUseCase(useCase));
  return { key, path: relativePath(path, config.root) };
}

function normalizeFrontmatterValue(field: string, value: string) {
  if (["level", "format", "status", "priority"].includes(field)) return value.toUpperCase().replace(/-/g, "_");
  if (field === "primary_actor") return slugify(value);
  return value;
}

function parseOutcome(value: string): ExtensionOutcome {
  const normalized = value.toUpperCase();
  if (normalized === "SUCCESS" || normalized === "FAILURE" || normalized === "PARTIAL") return normalized;
  throw new VspecError(
    "INVALID_ARGUMENT",
    `Invalid --outcome "${value}". Use one of: success, failure, partial (not free text). Put any explanation in the Extensions "(Outcome: ... — <text>)" line instead.`,
  );
}

function ensurePeriod(value: string): string {
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}

function displayNameOrRaw(value: string): string {
  if (value.includes(" ")) return value;
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
