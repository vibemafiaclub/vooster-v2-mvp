# 02 — File Format (Canonical On-Disk Contract)

This is the **canonical on-disk format**. Files are the source of truth for the
round-trip guarantee, but they are written **only by the CLI** — agents author
through `vspec usecase apply`, never by editing these files directly (see
principle 4 in `00-overview.md`). The parser and serializer must satisfy the
[round-trip guarantee](#round-trip-guarantee); this document is what they are
tested against.

There are **no UUIDs, no revision pointers, and no `project_id`** in any file.
Identity is human-readable and encoded in frontmatter + filename.

## Directory Layout

```
<repo root>/
├── .vspec/
│   └── config.json          # { "vspec_format": 1, "key_prefix": "VSPEC", "spec_language": "ko" }
└── specs/
    ├── glossary.md          # ubiquitous language + avoid terms
    ├── actors/
    │   ├── developer.md
    │   └── system.md
    ├── stakeholders/
    │   └── vooster.md
    ├── goals/
    │   └── G-001-author-a-use-case.md
    └── usecases/
        └── VSPEC-001-author-a-use-case.md
```

`.vspec/config.json` is the only state file. The repo is the project; there is
no session or cache directory. `spec_language` guides generated skeleton text
and agent instructions; `ko` is the MVP default.

`specs/glossary.md` is the domain language file. `doctor` reads its
`Avoid Terms` section and warns when use-case text uses those vague or
non-domain expressions instead of the preferred ubiquitous language.

## Frontmatter

YAML between `---` fences at the top of every file. Parsed and re-emitted with
`gray-matter`. Field order on serialization is fixed (the order shown below) so
round-trip is stable. Frontmatter is validated with a `zod` schema per type.

### UseCase

```yaml
---
vspec_format: 1
type: usecase
key: VSPEC-001 # <PREFIX>-<NNN>, assigned by the tool
title: Author a use case from scratch
level: USER_GOAL # SUMMARY | USER_GOAL | SUBFUNCTION
format: BRIEF # BRIEF | CASUAL | FULLY_DRESSED
status: DRAFT # DRAFT | IN_REVIEW | APPROVED | DEPRECATED
priority: P1 # P0 | P1 | P2 | P3
scope: vspec
primary_actor: developer # an actor `name`
frequency: daily # optional; omit if unset
---
```

### Actor

```yaml
---
vspec_format: 1
type: actor
name: developer # slug; matches filename
display_name: Developer
actor_type: PRIMARY # PRIMARY | SUPPORTING | OFFSTAGE
is_human: true
aliases: [dev, pm] # optional; omit if empty
---
```

### Stakeholder

```yaml
---
vspec_format: 1
type: stakeholder
name: vooster # slug; matches filename
display_name: Vooster (us)
stakeholder_type: INTERNAL # INTERNAL | EXTERNAL | REGULATORY
---
```

### Goal

```yaml
---
vspec_format: 1
type: goal
id: G-001 # G-<NNN>, assigned by the tool
actor: developer # an actor `name`
level: USER_GOAL # SUMMARY | USER_GOAL | SUBFUNCTION
status: IDENTIFIED # IDENTIFIED | IN_DESIGN | PROMOTED | REJECTED
priority: P1 # P0 | P1 | P2 | P3
linked_usecase: VSPEC-001 # optional; set on promote
---
```

## UseCase Body

Sections are recognized by **exact heading text**. They may appear in any order
in a hand-written file; `normalize` re-orders them to the canonical order below.
The body of an actor / stakeholder / goal file is free-form markdown (a
description); only the use-case body is structured.

```markdown
# <Title>

> One-paragraph context blurb (optional, free-form).

## Stakeholders and Interests

- **<Stakeholder display name>**: <interest>. _(Protected by: <step ref or guarantee>)_
- **<Stakeholder display name>**: <interest>.

## Preconditions

- <Precondition 1>
- <Precondition 2>

## Trigger

<One sentence.>

## Main Success Scenario

1. **<Actor>** <verb phrase>.
2. **System** <verb phrase>.
3. **<Actor>** <verb phrase>.

## Extensions

### 3a. <Condition>

- 3a1. **System** <verb phrase>.
- 3a2. **<Actor>** <verb phrase>.
- (Outcome: FAILURE — use case ends.)

### *a. <Any-step condition>

- *a1. **System** <verb phrase>.
- (Outcome: PARTIAL — rejoins main at step 4.)

## Success Guarantee

<Sentence or short paragraph.>

## Minimal Guarantee

<Sentence or short paragraph.>

## Notes

<Free-form. Not part of the contract; preserved verbatim.>
```

Canonical section order (used by `normalize`):
`Stakeholders and Interests` → `Preconditions` → `Trigger` →
`Main Success Scenario` → `Extensions` → `Success Guarantee` →
`Minimal Guarantee` → `Notes`.

## Parsing Rules

- **Bold actor** at the start of a step (`**Actor** ...`) is mandatory. The text
  between the `**` is the actor `name`; the rest is the `action`. Unknown actor
  names are a `doctor` error (not a parse error — the file still parses).
- **Main scenario** steps are a 1-based, contiguous numbered list. `normalize`
  re-numbers them.
- **Extension IDs** match `^\d+[a-z]$` (e.g. `3a`) or `^\*[a-z]$` (e.g. `*a`).
  Substep IDs are `<id>\d+` (e.g. `3a1`). The heading carries the ID +
  condition; the bullet list carries the handling.
- **Outcome line** `(Outcome: SUCCESS|FAILURE|PARTIAL — <free text>)` is parsed
  case-insensitively. If it names a rejoin step ("rejoins main at step N"), that
  step number is captured. Default outcome when absent is `FAILURE`.
- **`_(Protected by: ...)_`** trailing a stakeholder interest is parsed into that
  interest's `protection_mechanism`.
- The context blurb (`>` blockquote under the H1) and `## Notes` are preserved
  verbatim through round-trip.

## Parsed Shape (informative)

The in-memory shape a UseCase file parses into (TypeScript-ish):

```ts
type ParsedUseCase = {
  frontmatter: UseCaseFrontmatter; // the zod-validated fields above
  title: string;                   // from the H1
  blurb: string | null;
  stakeholderInterests: { stakeholder: string; interest: string; protectionMechanism: string | null }[];
  preconditions: string[];
  trigger: string | null;
  mainSuccess: { number: number; actor: string; action: string }[];
  extensions: {
    point: string;                 // "3a", "*a"
    condition: string;
    steps: { id: string; actor: string; action: string }[];
    outcome: "SUCCESS" | "FAILURE" | "PARTIAL";
    rejoinStep: number | null;
  }[];
  successGuarantee: string | null;
  minimalGuarantee: string | null;
  notes: string | null;
};
```

## Round-Trip Guarantee

For any well-formed file `F`:

```
serialize(parse(F)) === normalize(F)
```

where `normalize(F)`:

- re-orders frontmatter keys to the fixed order,
- drops optional frontmatter keys that are unset,
- re-orders body sections to the canonical order,
- re-numbers main-scenario steps to be 1-based contiguous,
- trims trailing whitespace on every line and ensures a single trailing newline.

`serialize` of a freshly parsed file must equal `normalize` of the original.
This is the central test of the parser/serializer phase (`GOAL.md` P1): a corpus
of fixture files under `tests/fixtures/` each assert
`serialize(parse(F)) === normalize(F)`, and `normalize(normalize(F)) ===
normalize(F)` (idempotence).

## Validation

`vspec doctor [<KEY or path>]` validates without network. The full rule list is
in `01-cockburn.md` (`What doctor Enforces`). Exit code 0 = valid (warnings
allowed); non-zero = at least one error.

## Example

The worked example lives at `specs/usecases/VSPEC-001-author-a-use-case.md` once
the tool can scaffold it (P3). Until then, the block under
[UseCase Body](#usecase-body) is the reference.
