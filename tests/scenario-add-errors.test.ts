import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const tsx = join(repoRoot, "node_modules/.bin/tsx");
const cli = join(repoRoot, "src/cli.ts");

let root: string;

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

describe("scenario add argument errors are actionable", () => {
  beforeEach(() => {
    root = join(tmpdir(), `vspec-scn-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("usecase", "create", "--title", "리뷰를 승인한다", "--primary-actor", "developer");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("names the valid --type values", () => {
    const env = errorEnvelope("scenario", "add", "VSPEC-001", "--type", "EXTENSION_X");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("main-success");
    expect(env.error?.message).toContain("extension");
  });

  it("explains the --at extension point format (rejects a bare step number)", () => {
    const env = errorEnvelope("scenario", "add", "VSPEC-001", "--type", "extension", "--at", "2");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("3a");
  });

  it("rejects free-text --outcome and names the enum", () => {
    const env = errorEnvelope(
      "scenario",
      "add",
      "VSPEC-001",
      "--type",
      "extension",
      "--at",
      "1a",
      "--outcome",
      "시스템이 등록을 중단한다",
    );
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("success");
    expect(env.error?.message).toContain("failure");
    expect(env.error?.message).toContain("partial");
  });

  it("accepts a well-formed extension", () => {
    const out = run("scenario", "add", "VSPEC-001", "--type", "extension", "--at", "1a", "--condition", "거부되면", "--outcome", "failure", "--format", "agent");
    expect(JSON.parse(out).status).toBe("ok");
  });
});
