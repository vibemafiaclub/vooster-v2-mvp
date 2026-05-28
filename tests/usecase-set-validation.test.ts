import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const tsx = join(repoRoot, "node_modules/.bin/tsx");
const cli = join(repoRoot, "src/cli.ts");

let root: string;
const ucPath = () => {
  const dir = join(root, "specs/usecases");
  const file = readdirSync(dir).find((name) => name.startsWith("VSPEC-001") && name.endsWith(".md"));
  return join(dir, file!);
};

function run(...args: string[]): string {
  return execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8" });
}

function errorEnvelope(...args: string[]): { error?: { code: string; message: string } } {
  try {
    execFileSync(tsx, [cli, ...args, "--format", "agent"], { cwd: root, encoding: "utf8" });
    throw new Error("expected command to fail");
  } catch (error) {
    return JSON.parse((error as { stdout: Buffer }).stdout.toString());
  }
}

describe("usecase set validates the value before writing", () => {
  beforeEach(() => {
    root = join(tmpdir(), `vspec-set-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("usecase", "create", "--title", "리뷰를 승인한다", "--primary-actor", "developer");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("rejects an invalid enum value and leaves the file uncorrupted", () => {
    const before = readFileSync(ucPath(), "utf8");
    const env = errorEnvelope("usecase", "set", "VSPEC-001", "--field", "status", "--value", "READY");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("draft");
    // The file must be byte-for-byte unchanged — no corrupt `status: READY` written.
    expect(readFileSync(ucPath(), "utf8")).toBe(before);
    // And every later command still loads it cleanly.
    expect(run("doctor", "VSPEC-001", "--format", "human")).toContain("No errors");
  });

  it("rejects an unknown field and lists settable fields", () => {
    const env = errorEnvelope("usecase", "set", "VSPEC-001", "--field", "nope", "--value", "x");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("Settable fields");
  });

  it("accepts a valid enum value", () => {
    const out = run("usecase", "set", "VSPEC-001", "--field", "format", "--value", "FULLY_DRESSED", "--format", "agent");
    expect(JSON.parse(out).status).toBe("ok");
    expect(readFileSync(ucPath(), "utf8")).toContain("format: FULLY_DRESSED");
  });
});
