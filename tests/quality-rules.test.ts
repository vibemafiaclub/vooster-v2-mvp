import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/project.js";
import { createActor, createStakeholder } from "../src/entity-commands.js";
import { runDoctor } from "../src/validate/doctor.js";

describe("doctor quality rules", () => {
  it("creates a glossary during init", () => {
    const root = join(tmpdir(), `vspec-glossary-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    const glossary = readFileSync(join(root, "specs/glossary.md"), "utf8");
    expect(glossary).toContain("## Preferred Terms");
    expect(glossary).toContain("## Avoid Terms");
    expect(readFileSync(join(root, ".vspec/config.json"), "utf8")).toContain('"spec_language": "ko"');
    rmSync(root, { recursive: true, force: true });
  });

  it("warns when a fully dressed use case is too vague for E2E translation", () => {
    const root = join(tmpdir(), `vspec-quality-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    createActor({ cwd: root, name: "developer", displayName: "개발자" });
    createStakeholder({ cwd: root, name: "team", displayName: "팀" });
    writeFileSync(
      join(root, "specs/usecases/VSPEC-001-vague.md"),
      `---
vspec_format: 1
type: usecase
key: VSPEC-001
title: 모호한 명세를 작성한다
level: USER_GOAL
format: FULLY_DRESSED
status: DRAFT
priority: P1
scope: vspec
primary_actor: developer
---
# 모호한 명세를 작성한다

## Stakeholders and Interests

- **팀**: 기능이 적절히 처리된다.

## Preconditions

- 요청이 존재한다.

## Trigger

개발자가 기능 명세를 요청한다.

## Main Success Scenario

1. **developer** 처리한다.
2. **developer** 클릭한다.
3. **developer** done.

## Extensions

## Success Guarantee

기능이 적절히 처리된다.

## Minimal Guarantee

오류가 관리된다.
`,
    );

    const rules = runDoctor({ root }).findings.map((finding) => finding.rule);
    expect(rules).toContain("quality-specific-step");
    expect(rules).toContain("observable-outcome");
    expect(rules).toContain("testable-guarantee");
    expect(rules).toContain("ubiquitous-language");
    expect(rules).toContain("no-ui-microdetail-unless-domain");
    expect(rules).toContain("acceptance-ready");
    rmSync(root, { recursive: true, force: true });
  });

  it("does not false-positive on Korean 등록 or Korean verb-phrase title", () => {
    const root = join(tmpdir(), `vspec-korean-${crypto.randomUUID()}`);
    mkdirSync(root, { recursive: true });
    initProject({ root, key: "VSPEC" });
    createActor({ cwd: root, name: "developer", displayName: "개발자" });
    createStakeholder({ cwd: root, name: "team", displayName: "팀" });
    writeFileSync(
      join(root, "specs/usecases/VSPEC-002-register.md"),
      `---
vspec_format: 1
type: usecase
key: VSPEC-002
title: PR 목록을 조회한다
level: USER_GOAL
format: BRIEF
status: DRAFT
priority: P1
scope: vspec
primary_actor: developer
---
# PR 목록을 조회한다

## Stakeholders and Interests

- **팀**: 저장소 등록 현황을 빠르게 확인한다.

## Preconditions

- 저장소가 존재한다.

## Trigger

개발자가 저장소를 등록한다.

## Main Success Scenario

1. **developer** 저장소를 등록한다.
2. **developer** 등록된 PR 목록을 조회한다.

## Success Guarantee

저장소 등록이 완료되고 목록에 표시된다.

## Minimal Guarantee

등록 요청이 기록된다.
`,
    );

    const findings = runDoctor({ root }).findings;
    const rules = findings.map((f) => f.rule);

    // "등" must NOT fire ubiquitous-language because it appears only as part of "등록" (substring)
    const ubiqLandings = findings.filter(
      (f) => f.rule === "ubiquitous-language" && f.message.includes('"등"'),
    );
    expect(ubiqLandings).toHaveLength(0);

    // quality-specific-step must NOT fire for "등" being a substring of "등록한다"
    const vagueStepFindings = findings.filter(
      (f) => f.rule === "quality-specific-step" && f.message.includes('"등"'),
    );
    expect(vagueStepFindings).toHaveLength(0);

    // title "PR 목록을 조회한다" ends with 다, so title-verb-phrase must NOT fire
    expect(rules).not.toContain("title-verb-phrase");

    rmSync(root, { recursive: true, force: true });
  });
});
