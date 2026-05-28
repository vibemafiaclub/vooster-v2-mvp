# GOAL — vspec local-first MVP

## Mission

Build a local-first, file-based CLI that lets an AI coding agent author,
validate, and export Cockburn use cases as markdown — with no server, no
database, no deployment. Reach **dogfooding** (author vspec's own specs with
vspec, offline) as fast as possible.

Read first: `docs/00-overview.md`, `docs/01-cockburn.md`,
`docs/02-file-format.md`, `docs/03-cli-spec.md`, `docs/04-agent-envelope.md`.

## How To Work This Goal

- **Test first.** Each task names a gate. Write the failing test, then the code.
- **One phase at a time, in order.** A phase is done only when its gate is green.
- **Track in `progress.json`.** Flip a task `todo → doing → done` as you go;
  flip a phase to `done` only when all its tasks are `done` and the gate passes.
- **Boring and small.** No layering ceremony. Pure functions for parse /
  serialize / validate / render; thin command wrappers around them.
- **The CLI is the only writer.** No DB, no network. The tool reads/writes
  `specs/` in the current working directory, and agents change specs only through
  `vspec` commands — never by editing the files directly (the filesystem backend
  will later be a remote DB).

A phase's **gate** is a concrete, runnable check (a test name or a command +
expected exit). Do not advance with a red gate.

---

## Phase 0 — Scaffold

**Objective:** a runnable empty `vspec` binary and a green test runner.

Tasks:
- `P0-T1` Init the package: `package.json` (`"type": "module"`, bin `vspec`),
  `tsconfig.json` (strict, NodeNext), `pnpm` install of `commander`,
  `gray-matter`, `zod`, and dev `vitest`, `prettier`, `typescript`, `tsx`.
- `P0-T2` Wire the CLI entry (`src/cli.ts`) with `commander`, registering a
  no-op `--version` and `--help`. Add `bin` resolution so `vspec` runs via `tsx`
  in dev and via the built JS in prod.
- `P0-T3` Add the domain types module (`src/domain/types.ts`) for the four
  entities' frontmatter + the `ParsedUseCase` shape from `02-file-format.md`.
- `P0-T4` Add the agent-envelope builders (`src/envelope.ts`) per
  `04-agent-envelope.md` with unit tests.

**Gate:** `pnpm test` runs green (envelope builder tests pass); `vspec --help`
exits 0 and lists at least one command stub.

## Phase 1 — Parser / Serializer with Round-Trip

**Objective:** the heart of the tool. Parse a use-case markdown file into
`ParsedUseCase` and serialize it back, satisfying the round-trip guarantee.

Tasks:
- `P1-T1` Frontmatter: parse/stringify via `gray-matter`; validate via zod
  schemas (`src/format/frontmatter.ts`). Fixed key order on output.
- `P1-T2` Body parser (`src/format/parse.ts`): blurb, stakeholder interests
  (with `protection_mechanism`), preconditions, trigger, main success steps
  (bold-actor split), extensions (point/condition/steps/outcome/rejoin), the
  two guarantees, notes. Per the parsing rules in `02-file-format.md`.
- `P1-T3` Serializer (`src/format/serialize.ts`): emit canonical section order,
  re-numbered steps, fixed frontmatter order, single trailing newline.
- `P1-T4` `normalize(F)` (`src/format/normalize.ts`): reorder + renumber + trim,
  and prove idempotence.
- `P1-T5` Fixture corpus under `tests/fixtures/usecases/` covering: minimal,
  fully-dressed, multiple extensions, `*a` any-step extension, out-of-order
  sections, non-contiguous step numbers, a context blurb, and a Notes section.

**Gate:** for every fixture `F`: `serialize(parse(F)) === normalize(F)` **and**
`normalize(normalize(F)) === normalize(F)`. All green in `pnpm test`.

## Phase 2 — `doctor` (offline validation)

**Objective:** validate files against the Cockburn rule table with no network.

Tasks:
- `P2-T1` Validation engine (`src/validate/doctor.ts`): one discrete check per
  row of the `What doctor Enforces` table in `01-cockburn.md`, each returning a
  finding `{ rule, level: "error"|"warn", message, location }`.
- `P2-T2` Cross-reference checks: `primary_actor`, step actors, and stakeholder
  references must resolve to files under `specs/actors/` & `specs/stakeholders/`.
- `P2-T3` `format`-aware required-field enforcement (error at FULLY_DRESSED,
  warn at BRIEF/CASUAL).
- `P2-T4` `vspec doctor [<KEY-or-path>]` command: no arg = whole `specs/` tree;
  exit 0 iff zero errors; `--format=agent` returns the envelope described in
  `04-agent-envelope.md` (`VALIDATION_FAILED` with `details.findings`).

**Gate:** a test fixture per error rule that `doctor` flags (red), plus a clean
fixture that passes with exit 0; `vspec doctor` on the clean fixture dir exits 0.

## Phase 3 — Use-case authoring (the dogfood loop core)

**Objective:** scaffold, list, and show use cases. Enough to author a real one
with the agent submitting the body through the CLI and the CLI doing keys +
validation + display.

Tasks:
- `P3-T1` `vspec init [--key <PREFIX>]`: write `.vspec/config.json` + `specs/`
  subdirs; idempotent; resolve config from cwd upward.
- `P3-T2` `vspec usecase create`: allocate next `<PREFIX>-NNN`, derive slug,
  write a BRIEF skeleton with every required heading present, honor `--from`.
- `P3-T3` `vspec usecase list` / `vspec usecase show` reading from files.
- `P3-T4` Key allocation helper (`src/keys.ts`) shared by usecase & goal create.

**Gate:** an e2e test that runs `init` → `usecase create` → reads the written
file → asserts it round-trips (`serialize(parse(F)) === normalize(F)`) and that
`doctor` reports only warnings (no errors) for the skeleton.

## Phase 4 — Actors, stakeholders, goals + convenience mutators

**Objective:** the supporting entities and the body-authoring gateway, so a fully
dressed use case is reachable through the CLI alone (hand-editing is not a path).

Tasks:
- `P4-T1` `actor create|list|show`, `stakeholder create|list|show` (file CRUD,
  slug filenames, zod-validated frontmatter, `ALREADY_EXISTS` guard).
- `P4-T2` `goal create|list|show|promote|reject`; `promote` flips status to
  PROMOTED, creates the linked use case, sets `linked_usecase`.
- `P4-T3` `usecase set` (frontmatter field), re-serializing through `normalize`.
- `P4-T4` `usecase apply [--section <name>]`: replace the whole body or one
  section from stdin, parsed + validated + normalized on write. Subsumes the body
  edits (stakeholders, scenarios, steps, guarantees, notes) — no per-field verbs.

**Gate:** an e2e test that builds a FULLY_DRESSED use case entirely via CLI
commands (actor + stakeholder + create + `usecase apply --section`), then
`doctor` exits 0 with no warnings.

## Phase 5 — Agent envelope across commands + `ai-guide`

**Objective:** every command speaks `--format=agent` with useful
`suggested_next_actions`; a fresh agent can self-onboard.

Tasks:
- `P5-T1` Thread `--format=agent|json|human` through every command via a shared
  output helper; map each error to a stable `error.code` from
  `04-agent-envelope.md`.
- `P5-T2` Populate `suggested_next_actions` for every command (success and
  error paths) per the examples in `03-cli-spec.md`.
- `P5-T3` `vspec ai-guide`: print an end-to-end authoring walkthrough to stdout.

**Gate:** a test that, for each command, asserts `--format=agent` emits a valid
envelope (schema-checked) with a non-empty `suggested_next_actions` on the happy
path; a test that the `KEY_NOT_FOUND` path returns the right code + a recovery
suggestion.

## Phase 6 — Gherkin export

**Objective:** turn a use case into a `.feature` file.

Tasks:
- `P6-T1` Gherkin renderer (`src/export/gherkin.ts`): `Feature:` line,
  `Background: Given the use case is in scope <scope>`, `Scenario: Main success`
  with `When <Actor> <action>` lines, and one `Scenario:` per extension with
  `Given main success reaches step N`, the `When` lines, and `Then outcome is
  <OUTCOME>`. (Mirror the format in the original `gherkin-renderer`.)
- `P6-T2` `vspec export gherkin <KEY> [--output <path>]`; default
  `tests/<KEY>.feature`; `--format=agent` puts the text in `data` and the path
  in `affected_files`.

**Gate:** a golden-file test: a fixture use case renders byte-for-byte to an
expected `.feature`.

## Phase 7 — Dogfooding

**Objective:** prove the loop on real content — vspec's own specs.

Tasks:
- `P7-T1` `vspec init --key VSPEC` at repo root.
- `P7-T2` Author ≥5 real use cases for *this project* (the authoring tool
  itself) via the CLI — `usecase create` then `usecase apply` (never hand-editing).
  Suggested seeds: "Author a use case", "Validate specs", "Export to Gherkin",
  "Scaffold a project", "Promote a goal to a use case". Include actors &
  stakeholders they reference.
- `P7-T3` `vspec doctor` over the whole tree exits 0 (warnings allowed).
- `P7-T4` `vspec export gherkin <KEY>` produces a `.feature` for each.
- `P7-T5` Fresh-agent check: starting from only `vspec ai-guide`, author one new
  use case end to end without reading other docs; capture the transcript/notes.

**Gate:** `vspec doctor` exits 0 over `specs/`; every authored file round-trips;
a `.feature` exists for each; the fresh-agent task succeeds. **This is the MVP
done line.**

---

## Definition of Done (whole goal)

All seven phase gates green, and the dogfooding gate (P7) demonstrated end to
end on this repo's own specs. No server, no database, no deploy step anywhere in
the loop.
