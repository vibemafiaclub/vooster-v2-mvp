import { readFileSync, writeFileSync } from "node:fs";
import type { ZodType } from "zod";
import { findUseCaseFile, readConfig, relativePath } from "./files.js";
import { applyBodySection, BODY_SECTIONS, parseUseCaseBody, parseUseCaseMarkdown, type BodySection } from "./format/parse.js";
import { serializeUseCase } from "./format/serialize.js";
import { formatSchema, levelSchema, prioritySchema, statusSchema } from "./format/frontmatter.js";
import { VspecError } from "./errors.js";
import type { ParsedUseCase } from "./domain/types.js";

const SETTABLE_FIELDS = ["title", "scope", "frequency", "level", "format", "status", "priority"] as const;

export function setUseCaseField(args: { key: string; field: string; value: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    const value = validatedFieldValue(args.field, args.value);
    (useCase.frontmatter as Record<string, unknown>)[args.field] = value;
    if (args.field === "title") useCase.title = args.value;
  });
}

// Replace the whole body (title, blurb, every section) from submitted markdown.
// The agent authors the content; this gateway parses, normalizes, and writes it
// through the same pipeline the file format guarantees — never raw bytes to disk.
export function applyUseCaseBody(args: { key: string; body: string; cwd?: string }) {
  return updateUseCase(args.cwd, args.key, (useCase) => {
    const parsed = parseUseCaseBody(args.body, useCase.frontmatter.title);
    useCase.title = parsed.title || useCase.frontmatter.title;
    useCase.frontmatter.title = useCase.title;
    useCase.blurb = parsed.blurb;
    useCase.stakeholderInterests = parsed.stakeholderInterests;
    useCase.preconditions = parsed.preconditions;
    useCase.trigger = parsed.trigger;
    useCase.mainSuccess = parsed.mainSuccess;
    useCase.extensions = parsed.extensions;
    useCase.successGuarantee = parsed.successGuarantee;
    useCase.minimalGuarantee = parsed.minimalGuarantee;
    useCase.notes = parsed.notes;
  });
}

// Replace one section from submitted content (the section body, no `## Heading`).
export function applyUseCaseSection(args: { key: string; section: string; content: string; cwd?: string }) {
  const section = validatedSection(args.section);
  return updateUseCase(args.cwd, args.key, (useCase) => {
    applyBodySection(useCase, section, args.content);
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

function validatedSection(raw: string): BodySection {
  const normalized = raw.toLowerCase();
  if ((BODY_SECTIONS as string[]).includes(normalized)) return normalized as BodySection;
  throw new VspecError(
    "INVALID_ARGUMENT",
    `Unknown --section "${raw}". Use one of: ${BODY_SECTIONS.join(", ")}. Omit --section to replace the whole body.`,
  );
}

function validatedFieldValue(field: string, raw: string): string {
  switch (field) {
    case "title":
    case "scope":
    case "frequency":
      return raw;
    case "level":
      return validatedEnum(levelSchema, "level", raw, "summary, user-goal, subfunction");
    case "format":
      return validatedEnum(formatSchema, "format", raw, "brief, casual, fully-dressed");
    case "status":
      return validatedEnum(statusSchema, "status", raw, "draft, in-review, approved, deprecated");
    case "priority":
      return validatedEnum(prioritySchema, "priority", raw, "p0, p1, p2, p3");
    default:
      throw new VspecError(
        "INVALID_ARGUMENT",
        `Cannot set field "${field}". Settable fields: ${SETTABLE_FIELDS.join(", ")}. To edit a body section, use vspec usecase apply <KEY> --section <name>.`,
      );
  }
}

function validatedEnum(schema: ZodType, field: string, raw: string, hint: string): string {
  const normalized = raw.toUpperCase().replace(/-/g, "_");
  if (!schema.safeParse(normalized).success) {
    throw new VspecError("INVALID_ARGUMENT", `Invalid ${field} "${raw}". Use one of: ${hint}.`);
  }
  return normalized;
}
