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
import { fileSlug, slugify } from "./slug.js";
import { VspecError } from "./errors.js";
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
  const slug = fileSlug(args.title);
  if (!slug) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      `Title "${args.title}" has no letters or numbers to build a file name from. Give the use case a descriptive title.`,
    );
  }
  const path = join(root, "specs/usecases", `${key}-${slug}.md`);
  const primaryActor = slugify(args.primaryActor);
  if (!primaryActor) {
    throw new VspecError(
      "INVALID_ARGUMENT",
      `primary-actor "${args.primaryActor}" is not a valid actor name. Use an ASCII slug like "user" — identifiers stay English even when the spec is Korean.`,
    );
  }
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
        interest: "요청한 기능이 검증 가능한 use case 계약으로 기록된다.",
        protectionMechanism: "Success Guarantee",
      },
    ],
    preconditions: [],
    trigger: `${displayName(primaryActor)}가 ${args.title} 명세 작성을 요청한다.`,
    mainSuccess: [{ number: 1, actor: primaryActor, action: `${args.title} 요청을 제출한다.` }],
    extensions: [],
    successGuarantee: "요청한 기능의 use case 파일이 생성되고 doctor로 검증할 수 있다.",
    minimalGuarantee: "기존 specification 파일은 명시적인 편집 없이 변경되지 않는다.",
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
      `${displayName(name)}가 시스템과 상호작용합니다.\n`,
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
  throw new VspecError("INVALID_ARGUMENT", `Invalid level "${value}". Use one of: summary, user-goal, subfunction.`);
}

function parsePriority(value: string): Priority {
  const normalized = value.toUpperCase();
  if (normalized === "P0" || normalized === "P1" || normalized === "P2" || normalized === "P3") return normalized;
  throw new VspecError("INVALID_ARGUMENT", `Invalid priority "${value}". Use one of: p0, p1, p2, p3.`);
}

function displayName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
