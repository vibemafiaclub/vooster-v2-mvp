---
name: analyze-session
description: >-
  Analyze a Claude Code session transcript (a .jsonl under ~/.claude/projects)
  in which vspec was used in some other repo, and surface prioritized,
  direction-aligned improvements to THIS project (the vspec CLI). Use when given
  a session .jsonl path (or asked to find vspec friction / dogfood feedback /
  "어디를 개선해야 할지" from a recorded agent run).
---

# Analyze a vspec dogfood session

Goal: turn one Claude Code session — where an agent used the `vspec` CLI to do
real work in another repo — into a **prioritized list of improvements to vspec**,
each grounded in transcript evidence and aligned with vspec's design direction.
You are reverse-engineering friction the agent hit, then proposing fixes that fit
the project's first principles (not generic CLI advice).

## 0. Inputs

You need the **session JSONL path**. If the user gave one, use it. Otherwise ask,
or list candidates: `ls -lt ~/.claude/projects/*/*.jsonl | head`. A session lives
at `~/.claude/projects/<cwd-with-slashes-as-dashes>/<uuid>.jsonl`.

NEVER `Read` the raw JSONL — it is often >1MB and will blow your context. Always
go through the extractor (step 2).

## 1. Internalize the direction (do this first, every time)

Read these so your recommendations align with what vspec is *for*, then write
yourself a 5-line "principles I will judge against" list:

- `docs/00-overview.md` — first principles. Key ones to hold:
  1. **Files are the source of truth** → a command must never leave a spec file
     in a state that later commands can't load. Corruption is a P0 bug.
  2. **The agent is the user** → every output (esp. errors) must be
     *self-teaching*: stable `error.code`, a human message, and
     `suggested_next_actions`. Agent-first means `--format=agent` is the default.
  3. **The CLI is the only mutation path** → the agent authors the *content*, but
     every add/edit/delete goes through a `vspec` command (`usecase apply` /
     `apply --section` / `set`). Files are today's storage; vspec is moving to a
     remote DB where direct file writes won't exist. So a direct `Edit`/`Write`
     under `specs/` is never the desired outcome — it signals a CLI capability gap
     (a section or operation the agent couldn't express through `apply`). The fix
     is to close that gap (or document it in `ai-guide`), never to bless
     hand-editing.
  4. **Boring & small** → prefer fixing the existing surface over adding new
     commands/flags.
- `docs/01-cockburn.md` + `docs/03-cli-spec.md` — the command surface, the
  `doctor` rule set, valid enums. (So you can tell a real bug from correct-but-
  unexplained behavior.)
- `docs/04-agent-envelope.md` — the envelope/`error.code` contract. Findings
  often = "implementation violates this contract."
- `docs/05-productivity-measurement.md` — the **QUANTS** lens (below). Classify
  each finding by which dimension it hurts.
- `src/ai-guide.ts` — what a fresh agent is actually told. Gaps here explain a lot
  of probing.
- `.vspec/config.json` convention: `spec_language` defaults to `ko`. Heuristics
  that assume English are bugs when ko is the default.

## 2. Distill the session

Run the extractor (it prints a compact, greppable digest — metadata, human
prompts, tool-usage counts, every vspec command in order, subcommand frequency,
`--format` usage, direct-edit-under-`specs/` counts, error codes + samples,
`suggested_next_actions` count, and the assistant's own narration):

```
.claude/skills/analyze-session/scripts/extract.sh <session.jsonl>
```

Read the whole digest. The **assistant narration** section is usually the richest
signal — the agent often literally writes where it got stuck ("CLI extension
포맷이 협조하지 않아 직접 작성"). Treat narration as a *claim of intent*; confirm
it against the **error samples** (trust but verify).

If you need the full text around a specific failure, drill in with targeted jq
(don't dump the file). Pattern for tool-result text:

```
jq -r 'select(.type=="user")|.message.content|if type=="array" then (.[]|select(.type=="tool_result")|(if (.content|type)=="array" then (.content[]|select(.type=="text")|.text) else (.content|tostring) end)) else empty end' <session.jsonl> | grep -A8 'YOUR_MARKER'
```

## 3. Friction signal catalog (what to look for)

Scan the digest for these. Each maps to a likely vspec defect:

| Signal in digest | Likely defect |
| --- | --- |
| Same subcommand called many times, mostly failing (high count in "subcommand frequency" + matching errors) | The command's contract is unclear or its errors are unhelpful. |
| Repeated `--help` probing for the same command | `ai-guide`/help doesn't document it (esp. enums, formats). |
| `"message": "<CODE>"` (message == code) | Error carries no actionable detail → agent must guess. |
| Raw `[{"code":"invalid_value",...}]` arrays | A zod/parse error leaked instead of the documented envelope. |
| A `set`/mutator "succeeds" then later commands fail on load | A command wrote an unvalidated value and **corrupted a file** (P0). |
| Any direct `Edit`/`Write`/`sed` touching files under `specs/` | A CLI capability gap: the agent fell back to hand-editing because `apply`/`apply --section`/`set` couldn't express that section or operation. Identify *which* section/op was missing and treat closing it as a defect (🔴 if it bypassed validation / could corrupt, 🟡 otherwise). Never resolve by endorsing direct edits. |
| Enum/format guessing (BOGUS, uppercase/lowercase, free-text where enum expected) | Missing value hints in help + errors. |
| `--format` usage shows json/human but never `agent`; low `suggested_next_actions` count | The self-teaching envelope isn't reaching the agent (default? guidance?). |
| `doctor` false positives, esp. on Korean text or short tokens | Lint heuristics assume English; ko is the default language. |
| Binary/setup confusion (`which`, "not found", alias) | Distribution/naming/`ai-guide` mismatch (note env vs. repo cause). |

## 4. Classify by QUANTS (docs/05)

For each finding name the dimension it degrades — this keeps the analysis aligned
with how the project measures value, and prevents "more speed but more
intervention" from looking like a win:

- **Q** Quality — wrong/incomplete output, file corruption, broken round-trip.
- **A** Attention — human/agent forced to intervene; agent spinning (retries,
  dead ends). Most friction lands here.
- **N** iNtellectual load — agent must hold methodology the tool should externalize
  (thin `ai-guide`, reverse-engineering formats).
- **T** Tempo — wasted turns/tokens (guardrail, not the headline).
- **S** Satisfaction/trust — output you can't trust without re-reading.

## 5. Write each finding

For every finding produce, tightly:

1. **Title + severity** (🔴 bug/corruption/contract-violation · 🟡 UX/guide · 🟢 polish).
2. **Evidence** — quote the exact command (with its digest line number) and the
   exact error text. Findings without transcript evidence don't ship.
3. **QUANTS dimension(s)**.
4. **Root cause** — point at the responsible area (`src/mutators.ts`,
   `src/output.ts` `errorInfo`, `src/validate/doctor.ts`, `src/ai-guide.ts`, …).
   Verify by reading that code before asserting the cause.
5. **Recommended direction** — the fix that fits the principles (step 1), via the
   rubric below.

### Alignment rubric (CLI fix vs. ai-guide vs. de-emphasize)

- Output is wrong / a file can be corrupted / the envelope contract is violated
  → **fix the CLI**. (Principles 1 & 2 are non-negotiable.)
- Behavior is correct but the agent couldn't discover it (enums, formats, the
  extension syntax) → **fix `ai-guide` and/or `--help`**, and make errors name the
  valid values. Don't add a flag if a better message suffices (principle 4).
- The agent hand-edited a file under `specs/` → find what `apply`/`apply --section`/
  `set` couldn't express (a missing section name, an awkward format, a delete/
  reorder with no command) and **close that gap or document it in `ai-guide`**.
  Never resolve by steering back to hand-editing — that path disappears with the
  remote DB (principle 3). Prefer extending the existing `apply` surface (a new
  `--section` value, a clearer error) over adding new top-level commands
  (principle 4).
- Heuristic misfires on Korean / non-English → make it language-aware; `ko` is the
  default, so English-only logic is a bug.

## 6. Deliver

Lead with a one-paragraph session summary (task, did it ultimately succeed, the
headline friction with rough counts: e.g. "usecase apply 19×, mostly failing on
--section extensions; 0× --format=agent; 33 direct Edits under specs/"). Then the
findings, severity-ordered, with the
"first 3 to fix" called out. End by offering to implement (each fix = its own
commit), but don't start coding until asked.

Keep the report skimmable — this is analysis, not a code change. Do not modify the
session file or the target repo.
