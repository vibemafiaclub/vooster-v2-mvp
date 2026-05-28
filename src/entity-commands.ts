import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  orderActorFrontmatter,
  orderGoalFrontmatter,
  orderStakeholderFrontmatter,
  parseActorFrontmatter,
  parseGoalFrontmatter,
  parseMatter,
  parseStakeholderFrontmatter,
  stringifyFrontmatter,
} from "./format/frontmatter.js";
import { readConfig, relativePath, walkFiles } from "./files.js";
import { nextGoalId } from "./keys.js";
import { fileSlug, slugify } from "./slug.js";
import { VspecError } from "./errors.js";
import { createUseCase } from "./usecase-commands.js";
import type { ActorFrontmatter, GoalFrontmatter, Priority, StakeholderFrontmatter, UseCaseLevel } from "./domain/types.js";

export function createActor(args: { name: string; displayName?: string; type?: string; human?: boolean; alias?: string[]; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const name = requireSlug(args.name, "actor name");
  const path = join(root, "specs/actors", `${name}.md`);
  if (existsSync(path)) throw new Error("ALREADY_EXISTS");
  const actorType = parseActorType(args.type ?? "primary");
  const fm: ActorFrontmatter = {
    vspec_format: 1,
    type: "actor",
    name,
    display_name: args.displayName ?? displayName(name),
    actor_type: actorType,
    is_human: args.human ?? actorType === "PRIMARY",
    ...(args.alias && args.alias.length > 0 ? { aliases: args.alias } : {}),
  };
  writeFileSync(path, stringifyFrontmatter(orderActorFrontmatter(fm), `${fm.display_name} actor.\n`));
  return { name, path: relativePath(path, root) };
}

export function listActors(args: { cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  return walkFiles(join(root, "specs/actors"), (path) => path.endsWith(".md")).map((path) => ({
    ...parseActorFrontmatter(parseMatter(readFileSync(path, "utf8")).data),
    path: relativePath(path, root),
  }));
}

export function showActor(args: { name: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/actors", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("ACTOR_NOT_FOUND");
  return { frontmatter: parseActorFrontmatter(parseMatter(readFileSync(path, "utf8")).data), path: relativePath(path, root) };
}

export function setActorField(args: { name: string; field: string; value: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/actors", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("ACTOR_NOT_FOUND");
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm = parseActorFrontmatter(parsed.data);
  switch (args.field) {
    case "display_name":
      fm.display_name = args.value;
      break;
    case "type":
      fm.actor_type = validatedActorType(args.value);
      break;
    case "is_human":
      fm.is_human = validatedBool("is_human", args.value);
      break;
    default:
      throw new VspecError(
        "INVALID_ARGUMENT",
        `Cannot set actor field "${args.field}". Settable fields: display_name, type, is_human. To edit the description body, use vspec actor apply <name>.`,
      );
  }
  writeFileSync(path, stringifyFrontmatter(orderActorFrontmatter(fm), parsed.content));
  return { name: fm.name, path: relativePath(path, root) };
}

// Author the actor's description body through the CLI (never a direct file edit).
export function applyActorBody(args: { name: string; body: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/actors", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("ACTOR_NOT_FOUND");
  const body = requireBody(args.body, "actor", args.name);
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm = parseActorFrontmatter(parsed.data);
  writeFileSync(path, stringifyFrontmatter(orderActorFrontmatter(fm), body));
  return { name: fm.name, path: relativePath(path, root) };
}

export function createStakeholder(args: { name: string; displayName?: string; type?: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const name = requireSlug(args.name, "stakeholder name");
  const path = join(root, "specs/stakeholders", `${name}.md`);
  if (existsSync(path)) throw new Error("ALREADY_EXISTS");
  const fm: StakeholderFrontmatter = {
    vspec_format: 1,
    type: "stakeholder",
    name,
    display_name: args.displayName ?? displayName(name),
    stakeholder_type: parseStakeholderType(args.type ?? "internal"),
  };
  writeFileSync(path, stringifyFrontmatter(orderStakeholderFrontmatter(fm), `${fm.display_name} stakeholder.\n`));
  return { name, path: relativePath(path, root) };
}

export function listStakeholders(args: { cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  return walkFiles(join(root, "specs/stakeholders"), (path) => path.endsWith(".md")).map((path) => ({
    ...parseStakeholderFrontmatter(parseMatter(readFileSync(path, "utf8")).data),
    path: relativePath(path, root),
  }));
}

export function showStakeholder(args: { name: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/stakeholders", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("STAKEHOLDER_NOT_FOUND");
  return { frontmatter: parseStakeholderFrontmatter(parseMatter(readFileSync(path, "utf8")).data), path: relativePath(path, root) };
}

export function setStakeholderField(args: { name: string; field: string; value: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/stakeholders", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("STAKEHOLDER_NOT_FOUND");
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm = parseStakeholderFrontmatter(parsed.data);
  switch (args.field) {
    case "display_name":
      fm.display_name = args.value;
      break;
    case "type":
      fm.stakeholder_type = validatedStakeholderType(args.value);
      break;
    default:
      throw new VspecError(
        "INVALID_ARGUMENT",
        `Cannot set stakeholder field "${args.field}". Settable fields: display_name, type. To edit the description body, use vspec stakeholder apply <name>.`,
      );
  }
  writeFileSync(path, stringifyFrontmatter(orderStakeholderFrontmatter(fm), parsed.content));
  return { name: fm.name, path: relativePath(path, root) };
}

export function applyStakeholderBody(args: { name: string; body: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = join(root, "specs/stakeholders", `${slugify(args.name)}.md`);
  if (!existsSync(path)) throw new Error("STAKEHOLDER_NOT_FOUND");
  const body = requireBody(args.body, "stakeholder", args.name);
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm = parseStakeholderFrontmatter(parsed.data);
  writeFileSync(path, stringifyFrontmatter(orderStakeholderFrontmatter(fm), body));
  return { name: fm.name, path: relativePath(path, root) };
}

export function createGoal(args: { actor: string; description: string; level?: string; priority?: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const id = nextGoalId(join(root, "specs/goals"));
  const slug = fileSlug(args.description);
  if (!slug) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      `description "${args.description}" has no letters or numbers to build a file name from. Describe the goal in words.`,
    );
  }
  const actor = requireSlug(args.actor, "actor");
  const path = join(root, "specs/goals", `${id}-${slug}.md`);
  const fm: GoalFrontmatter = {
    vspec_format: 1,
    type: "goal",
    id,
    actor,
    level: parseLevel(args.level ?? "user-goal"),
    status: "IDENTIFIED",
    priority: parsePriority(args.priority ?? "p1"),
  };
  writeFileSync(path, stringifyFrontmatter(orderGoalFrontmatter(fm), `${args.description}\n`));
  return { id, path: relativePath(path, root) };
}

export function listGoals(args: { actor?: string; status?: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  return walkFiles(join(root, "specs/goals"), (path) => path.endsWith(".md"))
    .map((path) => ({ path, frontmatter: parseGoalFrontmatter(parseMatter(readFileSync(path, "utf8")).data) }))
    .filter(({ frontmatter }) => !args.actor || frontmatter.actor === slugify(args.actor))
    .filter(({ frontmatter }) => !args.status || frontmatter.status === args.status.toUpperCase())
    .map(({ path, frontmatter }) => ({ ...frontmatter, path: relativePath(path, root) }));
}

export function showGoal(args: { id: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = findGoalFile(root, args.id);
  if (!path) throw new Error("GOAL_NOT_FOUND");
  return { frontmatter: parseGoalFrontmatter(parseMatter(readFileSync(path, "utf8")).data), path: relativePath(path, root) };
}

export function promoteGoal(args: { id: string; cwd?: string }) {
  const goal = showGoal(args);
  const created = createUseCase({
    cwd: args.cwd,
    title: readFileSync(join(mustConfig(args.cwd).root, goal.path), "utf8").split("---").pop()?.trim() || goal.frontmatter.id,
    primaryActor: goal.frontmatter.actor,
    level: goal.frontmatter.level,
    priority: goal.frontmatter.priority,
    from: args.id,
  });
  // Echo both the source goal id and the new use-case key — promote produces a use
  // case (key), which differs from goal create's payload (id); name both so the
  // caller never has to guess the shape.
  return { ...created, from: args.id };
}

export function rejectGoal(args: { id: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const path = findGoalFile(root, args.id);
  if (!path) throw new Error("GOAL_NOT_FOUND");
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm: GoalFrontmatter = { ...parseGoalFrontmatter(parsed.data), status: "REJECTED" };
  writeFileSync(path, stringifyFrontmatter(orderGoalFrontmatter(fm), parsed.content));
  return { id: args.id, path: relativePath(path, root), status: "REJECTED" as const };
}

function requireSlug(value: string, label: string): string {
  const slug = slugify(value);
  if (!slug) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      `${label} "${value}" must be an ASCII slug like "user" — identifiers stay English even when the spec is Korean.`,
    );
  }
  return slug;
}

function mustConfig(cwd?: string) {
  const config = readConfig(cwd ?? process.cwd());
  if (!config) throw new Error("NOT_INITIALIZED");
  return config;
}

function findGoalFile(root: string, id: string): string | null {
  return walkFiles(join(root, "specs/goals"), (path) => path.endsWith(".md")).find((path) => basename(path).startsWith(`${id}-`)) ?? null;
}

function parseLevel(value: string): UseCaseLevel {
  const normalized = value.toUpperCase().replace(/-/g, "_");
  if (normalized === "SUMMARY" || normalized === "USER_GOAL" || normalized === "SUBFUNCTION") return normalized;
  throw new Error("INVALID_ARGUMENT");
}

function parsePriority(value: string): Priority {
  const normalized = value.toUpperCase();
  if (normalized === "P0" || normalized === "P1" || normalized === "P2" || normalized === "P3") return normalized;
  throw new Error("INVALID_ARGUMENT");
}

function parseActorType(value: string): ActorFrontmatter["actor_type"] {
  const normalized = value.toUpperCase();
  if (normalized === "PRIMARY" || normalized === "SUPPORTING" || normalized === "OFFSTAGE") return normalized;
  throw new Error("INVALID_ARGUMENT");
}

function parseStakeholderType(value: string): StakeholderFrontmatter["stakeholder_type"] {
  const normalized = value.toUpperCase();
  if (normalized === "INTERNAL" || normalized === "EXTERNAL" || normalized === "REGULATORY") return normalized;
  throw new Error("INVALID_ARGUMENT");
}

// set/apply variants throw a self-teaching VspecError (named valid values), unlike
// the bare create-time parsers above.
function validatedActorType(raw: string): ActorFrontmatter["actor_type"] {
  const normalized = raw.toUpperCase();
  if (normalized === "PRIMARY" || normalized === "SUPPORTING" || normalized === "OFFSTAGE") return normalized;
  throw new VspecError("INVALID_ARGUMENT", `Invalid actor type "${raw}". Use one of: primary, supporting, offstage.`);
}

function validatedStakeholderType(raw: string): StakeholderFrontmatter["stakeholder_type"] {
  const normalized = raw.toUpperCase();
  if (normalized === "INTERNAL" || normalized === "EXTERNAL" || normalized === "REGULATORY") return normalized;
  throw new VspecError("INVALID_ARGUMENT", `Invalid stakeholder type "${raw}". Use one of: internal, external, regulatory.`);
}

function validatedBool(field: string, raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new VspecError("INVALID_ARGUMENT", `Invalid ${field} "${raw}". Use true or false.`);
}

function requireBody(raw: string, kind: "actor" | "stakeholder", name: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      `${kind} apply needs the description on stdin. Pipe it in, e.g. \`echo "..." | vspec ${kind} apply ${name}\`.`,
    );
  }
  return `${trimmed}\n`;
}

function displayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
