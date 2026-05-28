import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/validate/doctor.js";

describe("fully dressed CLI authoring", () => {
  it("builds a fully dressed use case via CLI commands with no doctor findings", () => {
    const root = join(tmpdir(), `vspec-full-${crypto.randomUUID()}`);
    const repoRoot = resolve(import.meta.dirname, "..");
    const tsx = join(repoRoot, "node_modules/.bin/tsx");
    const cli = join(repoRoot, "src/cli.ts");
    mkdirSync(root, { recursive: true });
    const run = (...args: string[]) => execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8" });

    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "customer", "--display-name", "Customer", "--type", "primary", "--human");
    run("stakeholder", "create", "--name", "business", "--display-name", "Business", "--type", "internal");
    run("usecase", "create", "--title", "Place an order", "--primary-actor", "customer", "--priority", "p0");
    run("usecase", "set", "VSPEC-001", "--field", "format", "--value", "FULLY_DRESSED");
    run("usecase", "add-stakeholder", "VSPEC-001", "--stakeholder", "Business", "--interest", "orders are captured accurately", "--protected-by", "step 2");
    run("step", "add", "VSPEC-001", "--actor", "system", "--action", "records the order");

    expect(runDoctor({ root }).findings).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
