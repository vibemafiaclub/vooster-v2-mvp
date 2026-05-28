import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/validate/doctor.js";

const cleanRoot = join(import.meta.dirname, "fixtures/doctor/clean");

describe("doctor validation", () => {
  it("passes a clean fixture", () => {
    const result = runDoctor({ root: cleanRoot });
    expect(result.findings).toEqual([]);
  });

  it.each([
    ["stakeholder-interest-present", (text: string) => text.replace(/- \*\*Vooster\*\*:.+\n/, "")],
    ["main-success-has-step", (text: string) => text.replace(/1\. \*\*developer\*\* requests validation\.\n2\. \*\*system\*\* validates the use case\.\n/, "")],
    ["step-bold-actor-action", (text: string) => text.replace("1. **developer** requests validation.", "1. developer requests validation.")],
    ["step-actor-exists", (text: string) => text.replace("**developer** requests", "**ghost** requests")],
    ["stakeholder-reference-exists", (text: string) => text.replace("**Vooster**", "**Unknown Org**")],
    ["primary-actor-exists", (text: string) => text.replace("primary_actor: developer", "primary_actor: ghost")],
    ["extension-references-step", (text: string) => text.replace("### 2a.", "### 9a.")],
    ["success-guarantee-present", (text: string) => text.replace("## Success Guarantee\n\nValidation findings are available.\n\n", "## Success Guarantee\n\n")],
    ["minimal-guarantee-present", (text: string) => text.replace("## Minimal Guarantee\n\nThe source file is unchanged.\n", "## Minimal Guarantee\n\n")],
    ["frontmatter-schema", (text: string) => text.replace("level: USER_GOAL", "level: WRONG")],
    ["required-field", (text: string) => text.replace("## Trigger\n\nDeveloper needs confidence.\n\n", "## Trigger\n\n")],
  ])("flags %s", (rule, mutate) => {
    const root = makeFixtureRoot(mutate(readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8")));
    const result = runDoctor({ root });
    expect(result.findings.some((finding) => finding.rule === rule && finding.level === "error")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("requires actor references to use the slug name, not the display name", () => {
    const root = makeFixtureRoot(
      readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8").replace("**developer** requests", "**개발자** requests"),
    );
    const result = runDoctor({ root });
    expect(result.findings.some((finding) => finding.rule === "step-actor-exists" && finding.level === "error")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("requires stakeholder references to use the slug name, not the display name", () => {
    const root = makeFixtureRoot(
      readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8").replace("**Vooster**", "**부스터**"),
    );
    const result = runDoctor({ root });
    expect(result.findings.some((finding) => finding.rule === "stakeholder-reference-exists" && finding.level === "error")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("makes stakeholder reference errors self-teaching with the available slugs", () => {
    const root = makeFixtureRoot(
      readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8").replace("**Vooster**", "**부스터**"),
    );
    const finding = runDoctor({ root }).findings.find((f) => f.rule === "stakeholder-reference-exists");
    expect(finding?.message).toContain("Available stakeholder slugs: vooster");
    expect(finding?.message).toContain("Reference the slug, not the display name");
    rmSync(root, { recursive: true, force: true });
  });

  it("makes actor reference errors self-teaching with the available slugs", () => {
    const root = makeFixtureRoot(
      readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8").replace("**developer** requests", "**개발자** requests"),
    );
    const finding = runDoctor({ root }).findings.find((f) => f.rule === "step-actor-exists");
    expect(finding?.message).toContain("Available actor slugs: developer, system");
    rmSync(root, { recursive: true, force: true });
  });

  it("suggests listing existing slugs, never a broken --name create from a display name", () => {
    const root = makeFixtureRoot(
      readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8").replace("**Vooster**", "**부스터**"),
    );
    const tsx = join(import.meta.dirname, "../node_modules/.bin/tsx");
    const cli = join(import.meta.dirname, "../src/cli.ts");
    let stdout = "";
    try {
      stdout = execFileSync(tsx, [cli, "doctor", "--format", "agent"], { cwd: root, encoding: "utf8" });
    } catch (error) {
      stdout = (error as { stdout: string }).stdout;
    }
    const commands = (JSON.parse(stdout).suggested_next_actions as { command: string }[]).map((action) => action.command);
    expect(commands).toContain("vspec stakeholder list");
    expect(commands.some((command) => /--name\s*-/.test(command) || /--name\s*$/.test(command))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  }, 15_000);

  it("warns for lower maturity required fields without failing", () => {
    const text = readFileSync(join(cleanRoot, "specs/usecases/VSPEC-001-validate-a-use-case.md"), "utf8")
      .replace("format: FULLY_DRESSED", "format: BRIEF")
      .replace("## Trigger\n\nDeveloper needs confidence.\n\n", "## Trigger\n\n");
    const root = makeFixtureRoot(text);
    const result = runDoctor({ root });
    expect(result.findings.some((finding) => finding.rule === "required-field" && finding.level === "warn")).toBe(true);
    expect(result.findings.some((finding) => finding.level === "error")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("cli exits 0 on the clean fixture dir", () => {
    const output = execFileSync("pnpm", ["exec", "tsx", join(import.meta.dirname, "../src/cli.ts"), "doctor", "--format", "human"], {
      cwd: cleanRoot,
      encoding: "utf8",
    });
    expect(output).toContain("No errors");
  });
});

function makeFixtureRoot(useCaseText: string): string {
  const root = join(tmpdir(), `vspec-doctor-${crypto.randomUUID()}`);
  mkdirSync(join(root, "specs/actors"), { recursive: true });
  mkdirSync(join(root, "specs/stakeholders"), { recursive: true });
  mkdirSync(join(root, "specs/usecases"), { recursive: true });
  writeFileSync(join(root, "specs/actors/developer.md"), readFileSync(join(cleanRoot, "specs/actors/developer.md")));
  writeFileSync(join(root, "specs/actors/system.md"), readFileSync(join(cleanRoot, "specs/actors/system.md")));
  writeFileSync(join(root, "specs/stakeholders/vooster.md"), readFileSync(join(cleanRoot, "specs/stakeholders/vooster.md")));
  writeFileSync(join(root, "specs/usecases/VSPEC-001-validate-a-use-case.md"), useCaseText);
  return root;
}
