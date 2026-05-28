import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/validate/doctor.js";

describe("fully dressed CLI authoring", () => {
  it("builds a fully dressed use case via apply with no doctor findings", () => {
    const root = join(tmpdir(), `vspec-full-${crypto.randomUUID()}`);
    const repoRoot = resolve(import.meta.dirname, "..");
    const tsx = join(repoRoot, "node_modules/.bin/tsx");
    const cli = join(repoRoot, "src/cli.ts");
    mkdirSync(root, { recursive: true });
    const run = (...args: string[]) => execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8" });
    const apply = (input: string, ...args: string[]) => execFileSync(tsx, [cli, ...args], { cwd: root, encoding: "utf8", input });

    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "customer", "--display-name", "Customer", "--type", "primary", "--human");
    run("stakeholder", "create", "--name", "business", "--display-name", "Business", "--type", "internal");
    run("usecase", "create", "--title", "Place an order", "--primary-actor", "customer", "--priority", "p0");
    run("usecase", "set", "VSPEC-001", "--field", "format", "--value", "FULLY_DRESSED");
    apply(
      "- **project-team**: 요청한 기능이 검증 가능한 use case 계약으로 기록된다. _(Protected by: Success Guarantee)_\n- **business**: orders are captured accurately _(Protected by: step 2)_\n",
      "usecase",
      "apply",
      "VSPEC-001",
      "--section",
      "stakeholders",
    );
    apply(
      "1. **customer** 장바구니 항목을 확인한다.\n2. **system** 주문을 기록한다.\n",
      "usecase",
      "apply",
      "VSPEC-001",
      "--section",
      "main-success",
    );

    expect(runDoctor({ root }).findings).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  }, 20_000);
});
