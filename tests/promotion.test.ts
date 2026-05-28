import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const tsx = join(repoRoot, "node_modules/.bin/tsx");
const cli = join(repoRoot, "src/cli.ts");

let root: string;
function run(...args: string[]): { status: string; suggested_next_actions: { command: string }[] } {
  return JSON.parse(execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8" }));
}
const promotes = (env: { suggested_next_actions: { command: string }[] }) =>
  env.suggested_next_actions.some((a) => /--field format --value FULLY_DRESSED/.test(a.command));

describe("FULLY_DRESSED promotion suggestion", () => {
  beforeEach(() => {
    root = join(tmpdir(), `vspec-promote-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("usecase", "create", "--title", "리뷰를 승인한다", "--primary-actor", "developer");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("doctor suggests promoting a complete BRIEF use case", () => {
    const report = run("doctor", "VSPEC-001");
    expect(report.status).toBe("ok");
    expect(promotes(report)).toBe(true);
  });

  it("stops suggesting once the use case is FULLY_DRESSED", () => {
    run("usecase", "set", "VSPEC-001", "--field", "format", "--value", "FULLY_DRESSED");
    expect(promotes(run("doctor", "VSPEC-001"))).toBe(false);
  });
});
