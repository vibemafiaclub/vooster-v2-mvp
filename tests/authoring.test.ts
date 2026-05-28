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
      [cli, "usecase", "create", "--title", "Author a use case", "--primary-actor", "developer"],
      { cwd: root, encoding: "utf8" },
    );
    const key = output.trim().split(/\s+/)[0]!;
    const file = readFileSync(join(root, "specs/usecases/VSPEC-001-author-a-use-case.md"), "utf8");
    expect(serializeUseCase(parseUseCaseMarkdown(file))).toBe(normalizeUseCaseMarkdown(file));
    expect(runDoctor({ root, target: key }).findings.filter((finding) => finding.level === "error")).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
