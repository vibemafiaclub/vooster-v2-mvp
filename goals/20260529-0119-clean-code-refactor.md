# REFACTOR GOAL — vspec 클린코드 패스

> 이 문서는 자율 루프(Codex)가 끝까지 완수해야 하는 **단일 계약서**다. 매 반복마다
> 이 파일 전체를 다시 읽고, 아래 "매 반복 시작 절차"를 그대로 따른다. 대화 맥락이
> 압축/소실되어도 **이 문서 + git 히스토리 + 테스트 결과**만으로 작업을 이어갈 수 있게
> 설계돼 있다. 기억이 아니라 이 세 가지를 진실로 믿는다.

## Mission

vspec CLI 코드베이스를 클린코드 관점에서 정리한다: (1) 한 파일에 과하게 몰린 책임을
분리하고, (2) 여러 파일에 중복된 로직을 단일 출처로 합친다. **기본은 동작 보존
리팩터링**이며, 동작을 바꾸는 곳은 각 task에 "BEHAVIOR CHANGE"로 명시된 항목뿐이다
(전부 기존 버그 수정 또는 의도된 에러 메시지 개선). 제품 동작·파일 포맷·CLI 외부
계약은 바뀌지 않는다.

이 작업은 `GOAL.md`(제품 목표)와 **별개의 리팩터링 이니셔티브**다. 절대 `GOAL.md`의
게이트를 깨서는 안 된다(아래 "절대 깨면 안 되는 불변식" 참조).

---

## 매 반복 시작 절차 (RESUME PROTOCOL — 반드시 이 순서)

1. **이 문서 전체를 다시 읽는다.**
2. **현재 상태를 코드에서 직접 확인한다** (기억/문서보다 우선):
   - `git log --oneline -20` — 어떤 task가 커밋됐는지가 진짜 진행 기록이다.
   - `git status --short` — 진행 중 미커밋 작업이 있는지.
   - `pnpm test && pnpm typecheck` — 지금 green인지.
3. **다음 할 일을 고른다**: 아래 "진행 원장(Progress Ledger)"에서 첫 번째 미완료 task.
   단, 원장과 git/테스트 결과가 어긋나면 **git/테스트를 진실로 보고 원장을 보정**한다
   (루프가 task 중간에 끊겼을 수 있다).
4. **그 task 하나만** 수행한다. 여러 task를 한 번에 묶지 않는다.
5. **게이트 통과**시킨다 (아래 "품질 게이트"). green이 아니면 task는 미완료다.
6. **커밋한다** — 1 task = 1 commit, 메시지 규칙 준수(아래).
7. **원장의 해당 체크박스를 `[x]`로 갱신**하고 한 줄 메모를 남긴 뒤 다음 반복으로.

> 끊김 복구: task 도중 중단되어 미커밋 변경이 남아 있고 게이트가 red면, 그 task를
> 완성하거나(가능하면) `git restore`로 되돌린 뒤 깨끗한 green에서 다시 시작한다.
> **red 상태를 커밋하지 않는다.**

### 커밋 메시지 규칙 (git 히스토리가 곧 진행 지도다)

- 리팩터(동작 보존): `refactor(P{n}-T{m}): <요약>`
- 버그 수정/동작 변경: `fix(P{n}-T{m}): <요약>`
- 안전망 테스트 추가: `test(P{n}-T{m}): <요약>`

예: `refactor(P1-T3): unify displayName into slug.ts`,
`fix(P3-T1): preserve goal title that contains ---`.
이렇게 하면 `git log --oneline | grep -E 'P[0-9]-T'` 한 줄로 완료 task 전부가 보인다.

---

## 작업 원칙 (이 코드베이스의 철학과 일치시킬 것)

- **Boring and small.** `GOAL.md`가 명시한 "No layering ceremony / premature
  abstraction보다 비슷한 줄 몇 개가 낫다"를 존중한다. 지시된 범위 밖의 추상화·일반화·
  "겸사겸사 정리"를 하지 않는다.
- **분기된 중복 = 동작 결정.** 합치려는 두 사본이 미묘하게 다른 경우(이 문서에 명시됨),
  단순 합치기가 아니라 **어느 동작을 채택하는지 결정**하는 일이다. 그 task는 반드시
  ① 달랐던 엣지케이스를 고정하는 테스트를 **먼저** 쓰고 ② 채택한 동작을 커밋 메시지에
  적는다. (`refactor`가 아니라 사실상 결정이므로 테스트로 박는다.)
- **CLI is the only writer.** `specs/` 파일을 직접 손으로 편집하지 않는다. 리팩터 대상은
  `src/`와 `tests/`뿐이다.
- **한 번에 하나.** 동작 변경 슬라이스와 구조 변경 슬라이스를 같은 커밋에 섞지 않는다.

### 범위 밖 (NON-GOALS — 루프가 절대 손대지 말 것)

새 기능 추가 / 파일 포맷·frontmatter 스키마 변경 / 엔벨로프 외부 형태 변경 /
새 의존성 추가 / CI·CD·커버리지 임계치 도입 / 의존성 버전 업 / 이 문서에 없는 파일
재배치 / 성능 최적화. 막히면 **멈추고 원장에 막힌 이유를 기록**하되, 범위를 넓히지 않는다.

---

## 품질 게이트 (느리거나 과해지지 않게 — 중요)

이 프로젝트의 테스트 스위트는 작다(약 17개 파일, 수 초 내 완료). **그 빠름을 유지하는
것이 게이트 설계의 핵심**이다.

**매 task의 게이트(이것만):**

```
pnpm test && pnpm typecheck
```

둘 다 green이어야 task 완료로 친다. 그 이상은 매 반복에서 돌리지 않는다.

**게이트를 가볍게 유지하는 규칙:**

- **새 도구를 도입하지 않는다.** vitest의 내장 스냅샷(`toMatchSnapshot`)과 기존
  fixture로 충분하다. 커버리지 측정은 Phase 0에서 **딱 한 번** 빈틈 파악용으로만 쓰고,
  매 반복 게이트에 넣지 않는다(느려진다).
- **스냅샷은 작고 정규화되게.** doctor findings는 `{rule, level, message, location}`
  튜플 배열처럼 의미 단위만 스냅샷한다. 엔벨로프 스냅샷에서는 **절대경로·timestamp·
  머신 의존 값을 정규화**(상대경로로, 또는 마스킹)해서 환경 간 흔들리지 않게 한다.
  파일 통째로 거대한 blob을 스냅샷하지 않는다.
- **테스트 수를 늘리기보다 기존 fixture를 재사용**한다. 이미 `tests/fixtures/usecases/`
  와 규칙별/라운드트립/엔벨로프 테스트가 있다. 같은 것을 중복 작성하지 않는다.
- **characterization 테스트의 수명을 구분**한다:
  - *영구 유지*: doctor findings 스냅샷, 명령별 엔벨로프 스냅샷(리팩터 후에도 회귀
    가치가 큼).
  - *임시 비계*: 특정 내부 함수 형태에만 묶인 테스트는 그 Phase가 끝나면 제거해
    스위트를 군살 없이 둔다. 제거도 커밋에 명시한다.
- 게이트가 **수 초**를 넘기기 시작하면 무언가 잘못된 것이다 — 무거운 테스트를 추가하지
  말고 원인을 줄인다.

---

## 절대 깨면 안 되는 불변식 (INVARIANTS)

리팩터 전후로 항상 참이어야 한다. 의심되면 테스트로 확인한다.

1. **라운드트립**: 모든 fixture `F`에 대해 `serialize(parse(F)) === normalize(F)`.
2. **멱등성**: `normalize(normalize(F)) === normalize(F)`.
3. **엔벨로프 스키마**: 모든 명령이 stdout에 유효한 단일 JSON 엔벨로프를 출력
   (`format_version`, `status`, `data`, `suggested_next_actions` 등 — `domain/types.ts`
   의 `AgentEnvelope`). `--format` 옵션은 없다.
4. **제품 게이트(GOAL.md)**: `vspec doctor`가 저장소 `specs/` 전체에서 exit 0,
   각 use case가 라운드트립, gherkin이 골든 파일과 바이트 일치.
5. `pnpm test`와 `pnpm typecheck` 모두 green.

---

## 작업 대상 정확 위치 (압축 후에도 자급되도록 명시)

| 키 | 현재 상태(파일:대략 위치) | 목표 |
|---|---|---|
| mustConfig | `entity-commands.ts`의 `mustConfig`(읽기+`NOT_INITIALIZED` 가드)만 존재. `usecase-commands.ts`(createUseCase/listUseCases/showUseCase 3곳), `mutators.ts`(updateUseCase), `export/gherkin.ts`가 인라인 복붙 | `files.ts`에 단일 `requireConfig()` export, 모든 인라인 가드 교체 |
| 디렉터리 상수 | `"specs/actors"|stakeholders|goals|usecases"`, `"specs/glossary.md"`가 `files.ts`/`project.ts`/`validate/doctor.ts`/`entity-commands.ts`/`usecase-commands.ts`/`keys.ts`에 산재 | `files.ts`에 `SPEC_DIRS` 상수, 전부 참조로 |
| displayName | `entity-commands.ts:~297`(필터 없음) vs `usecase-commands.ts:~154`(`.filter(Boolean)` 있음) — **분기됨** | `slug.ts`로 단일화. **채택 동작 = `.filter(Boolean)` 버전**(`a--b`/끝 하이픈에서 빈 조각 제거) |
| findGoalFile | `entity-commands.ts:~237`(`basename().startsWith(id+"-")`) vs `usecase-commands.ts:~132`(`path.includes(id+"-")`) — **분기됨** | `files.ts`로 단일화, `findUseCaseFile` 옆. **채택 동작 = 엄격한 `basename + startsWith`**(느슨한 includes 오매칭 제거) |
| trimTrailingWhitespace | `format/parse.ts:~113`와 `format/serialize.ts:~70`에 바이트 동일 사본 | 공용 유틸 1개로, 양쪽 import |
| enum 파서 (B) | `entity-commands.ts`의 `parseLevel`/`parsePriority`/`parseActorType`/`parseStakeholderType`/`validatedActorType`/`validatedStakeholderType`/`validatedBool`, `usecase-commands.ts`의 `parseLevel`/`parsePriority`, `mutators.ts`의 `validatedEnum` | 단일 `parseEnum`(+ 기존 zod 스키마 재사용)로 통합. 항상 **친절한 `VspecError`** 던짐 |
| promoteGoal (G) | `entity-commands.ts:~198`(public, title을 `readFileSync(...).split("---").pop()`로 추출 — `---` 포함 본문에서 깨짐) + `usecase-commands.ts:~136`(private, 동명이인) | title은 `parseMatter().content`로 정상 추출. private 쪽을 `markGoalPromoted` 등으로 개명해 동명이인 제거 |
| 에러 코드 타입 | `throw new Error("KEY_NOT_FOUND")` 등 stringly-typed 다수 + `output.ts`의 `errorInfo`가 문자열 매칭. `VspecError`와 `new Error("CODE")` 혼재 | `ErrorCode` union 타입 도입, `VspecError`가 받음, `errorInfo` switch를 exhaustive로(컴파일러가 누락/오타 강제 검출) |
| doctor 분해 | `validate/doctor.ts`의 `validateUseCase`(~20개 검사 한 함수) + 로더(`readEntityIndex`/`readGlossary`) + 품질 휴리스틱 + `looksLikeVerbPhrase`/`containsHangul`(후자는 `cli.ts`가 import) 혼재 | 규칙을 `(useCase, ctx) => Finding[]` 배열로 분해, 로더 분리, 휴리스틱은 도메인 쪽으로. **findings 출력은 완전 동일 유지** |
| doctor→runCommand | `cli.ts:~57` doctor 액션만 `runCommand` 미경유 + try/catch 없음(throw 시 최상위 핸들러가 엉뚱한 `INVALID_ARGUMENT`로 매핑) | doctor도 일관된 경로로, 올바른 에러 코드 매핑 |
| cli payload 추출 | `cli.ts`의 `suggestDoctorActions`/`runCommand`/`entityPayload`/`mutationPayload`/`entityMutationPayload`/`applyPayload`가 명령 트리와 뒤섞임 | payload 가공 로직을 별도 모듈로 분리, `cli.ts`는 명령 선언에 집중 |

---

## Phases

각 Phase는 **Objective / Tasks / Gate**를 가진다. Gate가 green이 아니면 다음 Phase로
넘어가지 않는다.

### Phase 0 — 베이스라인 안전망 (가장 먼저)

**Objective:** 이후 리팩터가 기댈 골든 마스터를 green으로 박는다.

- `P0-T1` `tests/fixtures/usecases/` 전체에 대해 `runDoctor` findings(`{rule, level,
  message, location}` 정렬 배열)를 스냅샷하는 테스트 추가. location은 상대경로로 정규화.
- `P0-T2` 주요 명령(`init`, `usecase create`, `usecase apply`, `usecase set`,
  `actor create`, `stakeholder create`, `goal create`, `goal promote`,
  `doctor`, `export gherkin`)을 `run()`으로 호출해 **엔벨로프를 정규화 후 스냅샷**하는
  e2e 테스트 추가(절대경로·환경 의존 값 마스킹). 이미 `agent-envelope.test.ts`가
  덮는 부분은 중복하지 말고 빠진 명령만 보강.
- `P0-T3` (1회성) `pnpm vitest run --coverage`로 미테스트 분기를 파악하고, 이후
  Phase가 건드릴 위험 지점에 characterization 테스트를 보강. **커버리지를 게이트에
  넣지 않는다.**

**Gate:** `pnpm test && pnpm typecheck` green. 새 스냅샷이 현재 동작을 고정한다.

### Phase 1 — Tier 1 quick wins (저비용·저위험)

**Objective:** 사소한 중복과 분기 제거. 대부분 기계적 이동, 일부는 분기 동작 결정.

- `P1-T1` `files.ts`에 `SPEC_DIRS` 상수 추가, 산재한 `"specs/..."` 리터럴 교체. (refactor)
- `P1-T2` `files.ts`에 `requireConfig()` 추가, 모든 인라인 `readConfig+NOT_INITIALIZED`
  가드와 `entity-commands`의 `mustConfig`를 이걸로 통일. (refactor)
- `P1-T3` `displayName`을 `slug.ts`로 단일화. **BEHAVIOR DECISION: `.filter(Boolean)`
  버전 채택** — 먼저 `displayName("a--b")` 등 엣지 테스트를 박고 합친다.
- `P1-T4` `findGoalFile`을 `files.ts`로 단일화(`findUseCaseFile` 옆). **BEHAVIOR
  DECISION: 엄격한 `basename + startsWith` 채택** — `G-1` vs `G-12` 구분 테스트를
  먼저 박고 합친다.
- `P1-T5` `trimTrailingWhitespace`를 공용 유틸로 추출, `parse.ts`/`serialize.ts`가 import.
  (refactor — 라운드트립/멱등성 불변식이 보호)
- `P1-T6` `cli.ts` doctor 액션을 일관된 명령 실행 경로로 보내 throw 시 올바른 에러
  코드로 매핑되게. 엔벨로프 스냅샷(P0-T2)이 출력 동일성을 보장.

**Gate:** `pnpm test && pnpm typecheck` green. P0 스냅샷이 (분기 결정으로 의도한 변화
외에는) 변하지 않음.

### Phase 2 — enum 파서 단일화 (B)

**Objective:** 최대 중복 클러스터 제거 + create/set 에러 품질 통일.

- `P2-T1` 단일 `parseEnum`(입력 정규화: 대문자화 + `-`→`_`, 허용집합 검사, 미스 시
  친절한 `VspecError`) 도입. 가능하면 기존 zod enum 스키마(`frontmatter.ts`)를 출처로 재사용.
- `P2-T2` `entity-commands`/`usecase-commands`/`mutators`의 enum 검증 9개 호출부를
  `parseEnum`으로 교체, 중복 함수 제거. **BEHAVIOR CHANGE: create 시점의 bare
  `Error("INVALID_ARGUMENT")`가 친절한 메시지로 바뀐다** — 바뀐 메시지를 단언하는
  테스트를 함께 갱신(`usecase-set-validation`/`actor-create`/`entity-mutators`).

**Gate:** `pnpm test && pnpm typecheck` green. 잘못된 enum 입력이 모두 친절한
`VspecError`로, 파일은 미변경.

### Phase 3 — promoteGoal 정리 + 버그 수정 (G)

**Objective:** 동명이인 제거 + `---` title 버그 수정 (red-green).

- `P3-T1` **BEHAVIOR CHANGE(버그 수정)**: 실패 테스트 먼저 — "description에 `---`가
  포함된 goal을 promote하면 use case title이 전체 보존된다". 그 후 title 추출을
  `parseMatter().content` 기반으로 교체. (fix)
- `P3-T2` `usecase-commands`의 private `promoteGoal`(상태 PROMOTED + linked_usecase
  세팅)을 의미 있는 이름(`markGoalPromoted` 등)으로 개명해 `entity-commands`의 public
  `promoteGoal`과의 동명이인을 제거. (refactor) — `promotion.test.ts`가 보호.

**Gate:** `pnpm test && pnpm typecheck` green. promote 시 상태/linked_usecase/title
모두 올바름.

### Phase 4 — 에러 코드 타입 안전화

**Objective:** stringly-typed 에러를 컴파일 타임 검사로. 리팩터 자체가 영구 안전망.

- `P4-T1` `ErrorCode` union 타입 정의(현재 사용 중인 코드 전수: `NOT_INITIALIZED`,
  `KEY_NOT_FOUND`, `ACTOR_NOT_FOUND`, `STAKEHOLDER_NOT_FOUND`, `GOAL_NOT_FOUND`,
  `ALREADY_EXISTS`, `ALREADY_INITIALIZED`, `INVALID_ARGUMENT`, `INVALID_FRONTMATTER`,
  `VALIDATION_FAILED` 등 — 코드에서 실제 grep해 확정). `VspecError`가 이 타입을 받게.
- `P4-T2` `throw new Error("CODE")` 자리를 `VspecError`(또는 코드 상수)로 통일,
  `output.ts`의 `errorInfo`를 union에 대해 **exhaustive switch**로(누락 시 컴파일 에러).
  `error-envelope.test.ts`가 매핑을 보호; 코드→메시지 매핑을 parametrized 테스트로 보강.

**Gate:** `pnpm test && pnpm typecheck` green. 알 수 없는 코드를 추가하면 컴파일이 막힘.

### Phase 5 — doctor.ts 책임 분해

**Objective:** 검증 엔진을 규칙 배열 + 로더로 분해. **findings는 완전 동일 유지.**

- `P5-T1` 로더(`readEntityIndex`, `readGlossary`, `resolveTargets`)를 별도 모듈로 분리.
- `P5-T2` `validateUseCase`의 ~20개 검사를 `(useCase, ctx) => Finding[]` 규칙 함수
  배열로 분해하고 `runDoctor`가 배열을 순회. 메시지·rule명·level·순서를 바꾸지 않는다
  (P0-T1 findings 스냅샷이 1바이트라도 다르면 실패해야 정상).
- `P5-T3` `looksLikeVerbPhrase`/`containsHangul`을 도메인 휴리스틱 위치로 이동하고
  `cli.ts` import 경로를 갱신(검증 파일에서 import하던 어색함 제거).

**Gate:** `pnpm test && pnpm typecheck` green. **doctor findings 스냅샷 무변화.**

### Phase 6 — cli.ts payload 가공 분리

**Objective:** `cli.ts`는 명령 선언에 집중, 응답 가공은 분리.

- `P6-T1` `entityPayload`/`mutationPayload`/`entityMutationPayload`/`applyPayload`/
  `suggestDoctorActions`를 별도 모듈로 추출(중복 형태는 합침). `cli.ts`는 호출만.
- `P6-T2` 추출 후 `cli.ts`가 명령 트리 + 얇은 위임만 남도록 정리.

**Gate:** `pnpm test && pnpm typecheck` green. **명령별 엔벨로프 스냅샷(P0-T2) 무변화.**

---

## Definition of Done (루프 종료 조건 — 명확히)

아래가 **모두** 참이면 목표 완수다. 이때 루프를 **멈추고** 최종 요약을 남긴다.
새로운 작업을 발명하거나 NON-GOALS로 넘어가지 않는다.

1. Phase 0–6의 모든 task가 원장에 `[x]`이고, 각 Phase Gate가 green.
2. `pnpm test && pnpm typecheck`가 green.
3. 모든 불변식(라운드트립·멱등성·엔벨로프 스키마·`vspec doctor` exit 0·gherkin 골든)
   유지.
4. `git log`에 task별 커밋이 규칙대로 남아 있음(진행 추적 가능).

**막혔을 때:** 어떤 task에서 게이트를 통과시킬 수 없으면, NON-GOALS로 우회하지 말고
원장에 ① 막힌 task ② 시도한 것 ③ 구체적 실패를 기록한 뒤, 가능한 다른 독립 task로
넘어간다. 모든 미완료 task가 동일하게 막혀 더 진행 불가하면 멈추고 보고한다.

---

## 진행 원장 (Progress Ledger — task 완료 시 `[x]`로 갱신 + 한 줄 메모)

> git 히스토리와 어긋나면 git을 진실로 보고 이 원장을 보정한다.

- [ ] P0-T1 doctor findings 스냅샷
- [ ] P0-T2 명령별 엔벨로프 e2e 스냅샷
- [ ] P0-T3 커버리지 1회 측정 + 빈틈 보강
- [ ] P1-T1 SPEC_DIRS 상수화
- [ ] P1-T2 requireConfig 통일
- [ ] P1-T3 displayName 단일화 (filter(Boolean) 채택)
- [ ] P1-T4 findGoalFile 단일화 (엄격 매칭 채택)
- [ ] P1-T5 trimTrailingWhitespace 공유
- [ ] P1-T6 doctor 명령 일관 경로화
- [ ] P2-T1 parseEnum 도입
- [ ] P2-T2 enum 호출부 교체 + 친절 에러 통일
- [ ] P3-T1 goal title `---` 버그 수정
- [ ] P3-T2 promoteGoal 동명이인 제거
- [ ] P4-T1 ErrorCode union 정의
- [ ] P4-T2 throw 통일 + errorInfo exhaustive
- [ ] P5-T1 doctor 로더 분리
- [ ] P5-T2 validateUseCase 규칙 배열 분해
- [ ] P5-T3 verb-phrase/hangul 휴리스틱 이동
- [ ] P6-T1 payload 가공 추출
- [ ] P6-T2 cli.ts 정리

### 막힘/메모 로그

(여기에 막힌 task와 사유를 누적 기록)
