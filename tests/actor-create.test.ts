import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/project.js";
import { createActor } from "../src/entity-commands.js";

const repoRoot = resolve(import.meta.dirname, "..");
const tsx = join(repoRoot, "node_modules/.bin/tsx");
const cli = join(repoRoot, "src/cli.ts");

function setup(): string {
  const root = join(tmpdir(), `vspec-actor-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  initProject({ root, key: "VSPEC" });
  return root;
}

function isHuman(root: string, name: string): boolean {
  return /^is_human: true$/m.test(readFileSync(join(root, "specs/actors", `${name}.md`), "utf8"));
}

describe("actor create is_human", () => {
  it("defaults a primary actor to human", () => {
    const root = setup();
    createActor({ cwd: root, name: "reader", type: "primary" });
    expect(isHuman(root, "reader")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("defaults a supporting actor to non-human", () => {
    const root = setup();
    createActor({ cwd: root, name: "book-database", type: "supporting" });
    expect(isHuman(root, "book-database")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("honors an explicit non-human override on a primary actor", () => {
    const root = setup();
    createActor({ cwd: root, name: "gateway", type: "primary", human: false });
    expect(isHuman(root, "gateway")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("--no-human via the CLI overrides the primary default", () => {
    const root = setup();
    execFileSync(tsx, [cli, "actor", "create", "--name", "ext-system", "--type", "primary", "--no-human"], { cwd: root });
    expect(isHuman(root, "ext-system")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  }, 15_000);
});
