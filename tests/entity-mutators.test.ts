import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const tsx = join(repoRoot, "node_modules/.bin/tsx");
const cli = join(repoRoot, "src/cli.ts");

let root: string;
const actorFile = () => readFileSync(join(root, "specs/actors/developer.md"), "utf8");
const stakeholderFile = () => readFileSync(join(root, "specs/stakeholders/team.md"), "utf8");

function run(...args: string[]): { status: string; data?: unknown; error?: { code: string; message: string } } {
  return JSON.parse(execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8" }));
}

function apply(input: string, ...args: string[]): { status: string; error?: { code: string; message: string } } {
  return JSON.parse(execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8", input }));
}

function expectError(args: string[], input?: string): { code: string; message: string } {
  try {
    execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8", input });
    throw new Error("expected command to fail");
  } catch (error) {
    return JSON.parse((error as { stdout: Buffer }).stdout.toString()).error;
  }
}

describe("actor/stakeholder authoring through the CLI", () => {
  beforeEach(() => {
    root = join(tmpdir(), `vspec-entity-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("stakeholder", "create", "--name", "team", "--display-name", "Team");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("sets actor frontmatter fields", () => {
    expect(run("actor", "set", "developer", "--field", "display_name", "--value", "개발자").status).toBe("ok");
    expect(actorFile()).toContain("display_name: 개발자");
    run("actor", "set", "developer", "--field", "type", "--value", "supporting");
    expect(actorFile()).toContain("actor_type: SUPPORTING");
    run("actor", "set", "developer", "--field", "is_human", "--value", "false");
    expect(actorFile()).toContain("is_human: false");
  });

  it("authors the actor body via stdin and keeps frontmatter intact", () => {
    expect(apply("개발 담당자. 명세를 작성하고 검토한다.", "actor", "apply", "developer").status).toBe("ok");
    const file = actorFile();
    expect(file).toContain("개발 담당자. 명세를 작성하고 검토한다.");
    expect(file).toContain("name: developer");
  });

  it("sets stakeholder fields and body", () => {
    run("stakeholder", "set", "team", "--field", "display_name", "--value", "개발팀");
    expect(stakeholderFile()).toContain("display_name: 개발팀");
    apply("프로덕트 품질에 책임을 진다.", "stakeholder", "apply", "team");
    expect(stakeholderFile()).toContain("프로덕트 품질에 책임을 진다.");
  });

  it("rejects an unknown field and names the settable fields", () => {
    const err = expectError(["actor", "set", "developer", "--field", "nope", "--value", "x"]);
    expect(err.code).toBe("INVALID_ARGUMENT");
    expect(err.message).toContain("Settable fields");
  });

  it("rejects an invalid enum value with a self-teaching message", () => {
    const err = expectError(["actor", "set", "developer", "--field", "type", "--value", "BOGUS"]);
    expect(err.code).toBe("INVALID_ARGUMENT");
    expect(err.message).toContain("primary, supporting, offstage");
  });

  it("rejects a blank body apply", () => {
    const before = actorFile();
    const err = expectError(["actor", "apply", "developer"], "   \n");
    expect(err.code).toBe("INVALID_ARGUMENT");
    expect(actorFile()).toBe(before);
  });

  it("errors when the actor does not exist", () => {
    const err = expectError(["actor", "set", "ghost", "--field", "display_name", "--value", "x"]);
    expect(err.code).toBe("ACTOR_NOT_FOUND");
  });
});
