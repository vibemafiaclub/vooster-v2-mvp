import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  orderActorFrontmatter,
  orderGoalFrontmatter,
  parseGoalFrontmatter,
  parseMatter,
  stringifyFrontmatter,
} from "./format/frontmatter.js";
import { parseUseCaseMarkdown } from "./format/parse.js";
import { serializeUseCase } from "./format/serialize.js";
import { findUseCaseFile, readConfig, relativePath, walkFiles } from "./files.js";
import { nextUseCaseKey } from "./keys.js";
import { slugify } from "./slug.js";
import type { GoalFrontmatter, ParsedUseCase, Priority, UseCaseLevel } from "./domain/types.js";

export function createUseCase(args: {
  title: string;
  primaryActor: string;
  level?: string;
  priority?: string;
  from?: string;
  cwd?: string;
}) {
  const config = readConfig(args.cwd ?? process.cwd());
  if (!config) throw new Error("NOT_INITIALIZED");
  const { root } = config;
  const key = nextUseCaseKey(config.config.key_prefix, join(root, "specs/usecases"));
  const slug = slugify(args.title);
  const path = join(root, "specs/usecases", `${key}-${slug}.md`);
  const primaryActor = slugify(args.primaryActor);
  ensureActor(root, primaryActor);
  const useCase: ParsedUseCase = {
    frontmatter: {
      vspec_format: 1,
      type: "usecase",
      key,
      title: args.title,
      level: parseLevel(args.level ?? "USER_GOAL"),
      format: "BRIEF",
      status: "DRAFT",
      priority: parsePriority(args.priority ?? "P1"),
      scope: config.config.key_prefix.toLowerCase(),
      primary_actor: primaryActor,
    },
    title: args.title,
    blurb: null,
    stakeholderInterests: [
      {
        stakeholder: "Project Team",
        interest: "the use case captures an actionable behavior contract.",
        protectionMechanism: "Success Guarantee",
      },
    ],
    preconditions: [],
    trigger: `${displayName(primaryActor)} needs to ${args.title.toLowerCase()}.`,
    mainSuccess: [{ number: 1, actor: primaryActor, action: `${args.title.toLowerCase()}.` }],
    extensions: [],
    successGuarantee: "The behavior contract is available as a use case file.",
    minimalGuarantee: "Existing specification files are not modified.",
    notes: null,
  };
  writeFileSync(path, serializeUseCase(useCase));
  const affectedFiles = [relativePath(path, root), `specs/actors/${primaryActor}.md`];
  if (args.from) {
    const goalPath = findGoalFile(root, args.from);
    if (!goalPath) throw new Error("GOAL_NOT_FOUND");
    promoteGoal(goalPath, key);
    affectedFiles.push(relativePath(goalPath, root));
  }
  return { key, path: relativePath(path, root), format: "BRIEF" as const, affectedFiles };
}

export function listUseCases(args: { cwd?: string; status?: string; actor?: string; level?: string; q?: string }) {
  const config = readConfig(args.cwd ?? process.cwd());
  if (!config) throw new Error("NOT_INITIALIZED");
  return walkFiles(join(config.root, "specs/usecases"), (path) => path.endsWith(".md"))
    .map((path) => ({ path, parsed: parseUseCaseMarkdown(readFileSync(path, "utf8")) }))
    .filter(({ parsed }) => !args.status || parsed.frontmatter.status === args.status.toUpperCase())
    .filter(({ parsed }) => !args.actor || parsed.frontmatter.primary_actor === slugify(args.actor!))
    .filter(({ parsed }) => !args.level || parsed.frontmatter.level === parseLevel(args.level!))
    .filter(({ parsed }) => !args.q || parsed.frontmatter.title.toLowerCase().includes(args.q.toLowerCase()))
    .map(({ path, parsed }) => ({
      key: parsed.frontmatter.key,
      title: parsed.frontmatter.title,
      level: parsed.frontmatter.level,
      status: parsed.frontmatter.status,
      path: relativePath(path, config.root),
    }));
}

export function showUseCase(args: { key: string; cwd?: string }) {
  const config = readConfig(args.cwd ?? process.cwd());
  if (!config) throw new Error("NOT_INITIALIZED");
  const path = findUseCaseFile(config.root, args.key);
  if (!path) throw new Error("KEY_NOT_FOUND");
  return { path: relativePath(path, config.root), useCase: parseUseCaseMarkdown(readFileSync(path, "utf8")) };
}

function ensureActor(root: string, name: string) {
  const path = join(root, "specs/actors", `${name}.md`);
  if (existsSync(path)) return;
  writeFileSync(
    path,
    stringifyFrontmatter(
      orderActorFrontmatter({
        vspec_format: 1,
        type: "actor",
        name,
        display_name: displayName(name),
        actor_type: "PRIMARY",
        is_human: true,
      }),
      `${displayName(name)} interacting with the system.\n`,
    ),
  );
}

function findGoalFile(root: string, id: string): string | null {
  return walkFiles(join(root, "specs/goals"), (path) => path.endsWith(".md")).find((path) => path.includes(`${id}-`)) ?? null;
}

function promoteGoal(path: string, key: string) {
  const parsed = parseMatter(readFileSync(path, "utf8"));
  const fm: GoalFrontmatter = { ...parseGoalFrontmatter(parsed.data), status: "PROMOTED", linked_usecase: key };
  writeFileSync(path, stringifyFrontmatter(orderGoalFrontmatter(fm), parsed.content));
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

function displayName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
