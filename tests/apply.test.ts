import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { parseUseCaseMarkdown } from "../src/format/parse.js";
import { serializeUseCase } from "../src/format/serialize.js";

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

function apply(input: string, ...args: string[]): { status: string; warnings: { message: string }[]; suggested_next_actions: { command: string }[] } {
  return JSON.parse(execFileSync(tsx, [cli, "usecase", "apply", ...args], { cwd: root, encoding: "utf8", input }));
}

function applyError(input: string, ...args: string[]): { error?: { code: string; message: string } } {
  try {
    execFileSync(tsx, [cli, "usecase", "apply", ...args], { cwd: root, encoding: "utf8", input });
    throw new Error("expected command to fail");
  } catch (error) {
    return JSON.parse((error as { stdout: Buffer }).stdout.toString());
  }
}

describe("usecase apply is the validated write gateway", () => {
  beforeEach(() => {
    root = join(tmpdir(), `vspec-apply-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    run("init", "--key", "VSPEC");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("usecase", "create", "--title", "리뷰를 승인한다", "--primary-actor", "developer");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("replaces one section and leaves the others intact", () => {
    const before = readFileSync(ucPath(), "utf8");
    expect(before).not.toContain("## Notes"); // skeleton omits the optional Notes section
    const env = apply("재고 정책은 별도 use case로 분리한다.", "VSPEC-001", "--section", "notes");
    expect(env.status).toBe("ok");
    const after = readFileSync(ucPath(), "utf8");
    expect(after).toContain("## Notes");
    expect(after).toContain("재고 정책은 별도 use case로 분리한다.");
    // The Trigger the skeleton wrote is untouched by a notes-only apply.
    expect(after).toContain("명세 작성을 요청한다.");
  });

  it("replaces the whole body but preserves frontmatter identity", () => {
    const body = [
      "# 리뷰를 승인한다",
      "",
      "## Trigger",
      "developer가 리뷰 승인을 요청한다.",
      "",
      "## Main Success Scenario",
      "1. **developer** 변경 사항을 검토한다.",
      "2. **system** 승인 상태를 기록한다.",
      "",
      "## Success Guarantee",
      "리뷰가 승인 상태로 기록된다.",
      "",
      "## Minimal Guarantee",
      "승인되지 않은 리뷰는 병합되지 않는다.",
      "",
    ].join("\n");
    const env = apply(body, "VSPEC-001");
    expect(env.status).toBe("ok");
    // A whole-body apply nudges toward per-section edits for next time.
    expect(env.suggested_next_actions.some((a) => /apply VSPEC-001 --section/.test(a.command))).toBe(true);
    const after = readFileSync(ucPath(), "utf8");
    expect(after).toContain("key: VSPEC-001");
    expect(after).toContain("primary_actor: developer");
    expect(after).toContain("2. **system** 승인 상태를 기록한다.");
  });

  it("rejects an unknown --section and leaves the file byte-for-byte unchanged", () => {
    const before = readFileSync(ucPath(), "utf8");
    const env = applyError("x", "VSPEC-001", "--section", "bogus");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(env.error?.message).toContain("notes");
    expect(readFileSync(ucPath(), "utf8")).toBe(before);
  });

  it("rejects a blank whole-body apply (guards against wiping the body)", () => {
    const before = readFileSync(ucPath(), "utf8");
    const env = applyError("   \n", "VSPEC-001");
    expect(env.error?.code).toBe("INVALID_ARGUMENT");
    expect(readFileSync(ucPath(), "utf8")).toBe(before);
  });

  it("surfaces doctor findings inline so the agent need not re-run doctor", () => {
    const env = apply("- **acme**: 주문이 정확히 기록된다.", "VSPEC-001", "--section", "stakeholders");
    expect(env.status).toBe("ok");
    expect(env.warnings.some((w) => /acme does not exist/.test(w.message))).toBe(true);
  });

  it("writes a file that round-trips through parse + serialize", () => {
    apply("1. **developer** 변경 사항을 검토한다.\n2. **system** 승인 상태를 기록한다.\n", "VSPEC-001", "--section", "main-success");
    const text = readFileSync(ucPath(), "utf8");
    expect(serializeUseCase(parseUseCaseMarkdown(text))).toBe(text);
  });
});
