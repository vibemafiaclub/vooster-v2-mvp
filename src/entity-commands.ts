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
import { slugify } from "./slug.js";
import { createUseCase } from "./usecase-commands.js";
import type { ActorFrontmatter, GoalFrontmatter, Priority, StakeholderFrontmatter, UseCaseLevel } from "./domain/types.js";

export function createActor(args: { name: string; displayName?: string; type?: string; human?: boolean; alias?: string[]; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const name = slugify(args.name);
  const path = join(root, "specs/actors", `${name}.md`);
  if (existsSync(path)) throw new Error("ALREADY_EXISTS");
  const fm: ActorFrontmatter = {
    vspec_format: 1,
    type: "actor",
    name,
    display_name: args.displayName ?? displayName(name),
    actor_type: parseActorType(args.type ?? "primary"),
    is_human: args.human ?? true,
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

export function createStakeholder(args: { name: string; displayName?: string; type?: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const name = slugify(args.name);
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

export function createGoal(args: { actor: string; description: string; level?: string; priority?: string; cwd?: string }) {
  const { root } = mustConfig(args.cwd);
  const id = nextGoalId(join(root, "specs/goals"));
  const path = join(root, "specs/goals", `${id}-${slugify(args.description)}.md`);
  const fm: GoalFrontmatter = {
    vspec_format: 1,
    type: "goal",
    id,
    actor: slugify(args.actor),
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
  return createUseCase({
    cwd: args.cwd,
    title: readFileSync(join(mustConfig(args.cwd).root, goal.path), "utf8").split("---").pop()?.trim() || goal.frontmatter.id,
    primaryActor: goal.frontmatter.actor,
    level: goal.frontmatter.level,
    priority: goal.frontmatter.priority,
    from: args.id,
  });
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

function displayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
