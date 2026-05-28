# 04 — Agent Envelope (`--format=agent`)

Every command prints a single JSON object by default: the **agent
envelope** (`--format=agent` is the default; pass `--format=human` or
`--format=json` to opt out). It is the machine contract an AI agent reads to
know what happened, what changed on disk, and what to do next. It is adapted from the original
vspec envelope v2, trimmed for a local-first tool (no branch/session/revision
context).

## Shape

```ts
type AgentEnvelope<TData> = {
  format_version: 1;
  status: "ok" | "error";
  data: TData | null;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  context: { project_key: string | null };
  affected_files: { path: string }[];
  dry_run: boolean;
  suggested_next_actions: { command: string; reason?: string }[];
  warnings: { message: string }[];
};
```

Differences from the old server envelope: `context` keeps only `project_key`
(no `branch`, `session_id`, `revision`); `affected_files` entries are just a
`path` (no `revision`). `format_version` resets to `1` for this codebase.

## Field Semantics

| Field                    | Meaning                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `format_version`         | Always `1` for this MVP. Bump on a breaking envelope change.           |
| `status`                 | `"ok"` on success, `"error"` on failure (exit code is non-zero too).  |
| `data`                   | The command's payload (shape per command). `null` on error.           |
| `error`                  | Present only when `status="error"`. `code` is stable & machine-usable.|
| `context.project_key`    | The `key_prefix` from `.vspec/config.json`, or `null` outside a repo. |
| `affected_files`         | Files created/modified by this command (empty for read-only commands).|
| `dry_run`                | `true` if the command ran without writing (e.g. a future `--dry-run`).|
| `suggested_next_actions` | Ordered next commands the agent should consider. Drives self-teaching.|
| `warnings`               | Non-fatal issues (e.g. `doctor` warnings, verb-phrase heuristics).    |

## Stable Error Codes

`error.code` must be one of a closed, documented set so agents can branch on it.
Initial set (extend as commands are added):

| Code                       | When                                                       |
| -------------------------- | --------------------------------------------------------- |
| `NOT_INITIALIZED`          | No `.vspec/config.json` in cwd or any parent.             |
| `KEY_NOT_FOUND`            | Referenced use-case key has no file.                      |
| `ACTOR_NOT_FOUND`          | Referenced actor name has no file.                        |
| `STAKEHOLDER_NOT_FOUND`    | Referenced stakeholder name has no file.                  |
| `GOAL_NOT_FOUND`           | Referenced goal id has no file.                           |
| `INVALID_FRONTMATTER`      | Frontmatter fails its zod schema.                         |
| `MISSING_REQUIRED_SECTION` | A required body section is absent (per `format`).          |
| `INVALID_ARGUMENT`         | A flag value is malformed or an enum value is unknown.    |
| `ALREADY_EXISTS`           | Creating an entity whose file already exists.             |

`doctor` is special: it returns `status: "ok"` with `warnings` populated when
there are only warnings, and `status: "error"` (code `VALIDATION_FAILED`) with
the per-rule failures in `error.details.findings` when there are errors.

## Examples

Success — `vspec usecase create --title "Author a use case" --primary-actor developer --format=agent`:

```json
{
  "format_version": 1,
  "status": "ok",
  "data": { "key": "VSPEC-001", "path": "specs/usecases/VSPEC-001-author-a-use-case.md", "format": "BRIEF" },
  "context": { "project_key": "VSPEC" },
  "affected_files": [{ "path": "specs/usecases/VSPEC-001-author-a-use-case.md" }],
  "dry_run": false,
  "suggested_next_actions": [
    { "command": "vspec usecase apply VSPEC-001 --section main-success", "reason": "Author the main success steps (pipe the numbered list via stdin)." },
    { "command": "vspec doctor VSPEC-001", "reason": "Validate before committing." }
  ],
  "warnings": []
}
```

Error — `vspec usecase show VSPEC-404 --format=agent`:

```json
{
  "format_version": 1,
  "status": "error",
  "data": null,
  "error": { "code": "KEY_NOT_FOUND", "message": "No use case with key VSPEC-404." },
  "context": { "project_key": "VSPEC" },
  "affected_files": [],
  "dry_run": false,
  "suggested_next_actions": [{ "command": "vspec usecase list", "reason": "See available keys." }],
  "warnings": []
}
```

## Implementation Note

Provide two builders, mirroring the original codebase:

```ts
buildOkEnvelope({ data, context?, affectedFiles?, dryRun?, suggestedNextActions?, warnings? })
buildErrorEnvelope({ error, context?, suggestedNextActions?, warnings? })
```

Defaults: `affected_files=[]`, `dry_run=false`, `suggested_next_actions=[]`,
`warnings=[]`, `context.project_key=null`. The envelope builders are pure and
unit-tested independently of any command.
