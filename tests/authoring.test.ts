import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/project.js";
import { createUseCase, listUseCases, showUseCase } from "../src/usecase-commands.js";
import { parseUseCaseMarkdown } from "../src/format/parse.js";
import { serializeUseCase } from "../src/format/serialize.js";
import { normalizeUseCaseMarkdown } from "../src/format/normalize.js";
import { runDoctor } from "../src/validate/doctor.js";

describe("use-case authoring loop", () => {
  it("runs init -> usecase create -> round-trip -> doctor with no errors", () => {
    const root = join(tmpdir(), `vspec-authoring-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    const created = createUseCase({ cwd: root, title: "Author a use case", primaryActor: "developer" });
    const file = readFileSync(join(root, created.path), "utf8");
    expect(serializeUseCase(parseUseCaseMarkdown(file))).toBe(normalizeUseCaseMarkdown(file));
    expect(runDoctor({ root, target: created.key }).findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(listUseCases({ cwd: root })).toHaveLength(1);
    expect(showUseCase({ cwd: root, key: created.key }).useCase.frontmatter.title).toBe("Author a use case");
    rmSync(root, { recursive: true, force: true });
  });

  it("runs the CLI init -> usecase create gate", () => {
    const root = join(tmpdir(), `vspec-authoring-cli-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    const repoRoot = resolve(import.meta.dirname, "..");
    const cli = join(repoRoot, "src/cli.ts");
    const tsx = join(repoRoot, "node_modules/.bin/tsx");
    execFileSync(tsx, [cli, "init", "--key", "VSPEC"], { cwd: root });
    const output = execFileSync(
      tsx,
      [cli, "usecase", "create", "--title", "Author a use case", "--primary-actor", "developer", "--format", "human"],
      { cwd: root, encoding: "utf8" },
    );
    const key = output.trim().split(/\s+/)[0]!;
    const file = readFileSync(join(root, "specs/usecases/VSPEC-001-author-a-use-case.md"), "utf8");
    expect(serializeUseCase(parseUseCaseMarkdown(file))).toBe(normalizeUseCaseMarkdown(file));
    expect(runDoctor({ root, target: key }).findings.filter((finding) => finding.level === "error")).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("creates Korean-first skeleton text for new use cases", () => {
    const root = join(tmpdir(), `vspec-korean-skeleton-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    const created = createUseCase({ cwd: root, title: "리뷰 요청을 승인한다", primaryActor: "developer" });
    const file = readFileSync(join(root, created.path), "utf8");
    expect(file).toContain("요청한 기능이 검증 가능한 use case 계약으로 기록된다.");
    expect(file).toContain("Developer가 리뷰 요청을 승인한다 명세 작성을 요청한다.");
    expect(file).toContain("리뷰 요청을 승인한다 요청을 제출한다.");
    rmSync(root, { recursive: true, force: true });
  });

  it("derives a meaningful Korean filename instead of an empty slug", () => {
    const root = join(tmpdir(), `vspec-korean-slug-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    const created = createUseCase({ cwd: root, title: "리뷰 완료 후 학습 루프 실행", primaryActor: "developer" });
    expect(created.path).toBe("specs/usecases/VSPEC-001-리뷰-완료-후-학습-루프-실행.md");
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a title that produces an empty slug instead of writing VSPEC-001-.md", () => {
    const root = join(tmpdir(), `vspec-empty-slug-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    expect(() => createUseCase({ cwd: root, title: "!!! ??? ...", primaryActor: "developer" })).toThrow(/no letters or numbers/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a non-slug primary actor instead of creating specs/actors/.md", () => {
    const root = join(tmpdir(), `vspec-bad-actor-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    expect(() => createUseCase({ cwd: root, title: "Author a use case", primaryActor: "사용자" })).toThrow(/not a valid actor name/);
    rmSync(root, { recursive: true, force: true });
  });
});
