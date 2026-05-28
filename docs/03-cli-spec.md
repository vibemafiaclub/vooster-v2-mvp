# 03 — CLI Spec

The binary is `vspec`. It is the only product surface. It is **agent-first**:
every command returns the envelope defined in `04-agent-envelope.md`, and
`--format=agent` is the **default** — the agent is the primary user, so it does
not have to pass a flag. Pass `--format=human` for concise readable lines or
`--format=json` for the raw `data` payload.

All commands operate on the **current working directory's** `specs/` tree. There
is no network, no auth, no `--api-url`, no session, no project flag. The repo is
the project.

## Output Formats

| Flag                | Output                                                       |
| ------------------- | ----------------------------------------------------------- |
| `--format=agent`    | **Default.** The full agent envelope (`04-agent-envelope.md`).|
| `--format=json`     | The raw `data` payload as JSON.                              |
| `--format=human`    | Short human-readable lines.                                  |

Errors in `--format=agent` are returned as an envelope with `status: "error"`
and exit code non-zero. In `human`/`json` they print a message to stderr and
exit non-zero.

## Command Surface

The surface is intentionally small. Commands are grouped into **core** (the
dogfooding loop — build these first) and **supporting** (entity CRUD and
frontmatter edits). There is no "edit the file directly" path: every change to a
use case goes through a `vspec` command. Body authoring is `vspec usecase apply`
(whole body, or one `--section`); frontmatter is `vspec usecase set`. The
filesystem is the current backend and will be replaced by a remote DB, so the CLI
is the only sanctioned writer.

### Core

```
vspec init [--key <PREFIX>]
    Create .vspec/config.json and specs/{actors,stakeholders,goals,usecases}/.
    --key sets the use-case key prefix (default: derived from the repo dir name,
    uppercased). Idempotent: re-running does not clobber existing files.

vspec ai-guide
    Print the agent guide to stdout (how to author a use case end to end).

vspec doctor [<KEY-or-path>]
    Validate offline. No argument = validate every file under specs/.
    A KEY (e.g. VSPEC-001) or a path validates one file.
    Exit 0 if no errors (warnings allowed); non-zero if any error.

vspec usecase create --title "<verb phrase>" --primary-actor <name> \
    [--level user-goal|subfunction|summary] [--priority p0|p1|p2|p3] \
    [--from <G-NNN>]
    Allocate the next key (<PREFIX>-NNN) and write a BRIEF skeleton file with all
    required headings present (empty where unknown). --from links the source goal
    and flips that goal to PROMOTED. Prints the new key and file path.

vspec usecase apply <KEY-NNN> [--section <name>]
    Replace the use-case body from content piped via stdin. With --section, replace
    just that section; the names are: blurb, stakeholders, preconditions, trigger,
    main-success, extensions, success-guarantee, minimal-guarantee, notes. Without
    --section, the stdin is the full body (title + every section) and replaces it
    wholesale. The agent authors the content; the CLI parses, validates, and
    normalizes it on write (a reject leaves the file untouched), and returns
    doctor findings in the envelope warnings. This is the body-authoring path —
    never edit the markdown file directly.

vspec usecase list [--status=] [--actor=] [--level=] [--q=<substr>]
    List use cases (key, title, level, status) from files.

vspec usecase show <KEY-NNN>
    Print the parsed use case (human) or its parsed shape (json/agent).

vspec export gherkin <KEY-NNN> [--output <path>]
    Render the use case to a .feature. Default output: tests/<KEY-NNN>.feature.
    With --format=agent, the .feature text is in data and the written path is in
    affected_files.
```

### Supporting (entity CRUD + frontmatter)

```
vspec actor create --name <n> [--display-name <d>] \
    [--type primary|supporting|offstage] [--human|--no-human] [--alias <a> ...]
    is_human defaults from --type (human for primary, non-human otherwise);
    --human / --no-human override it.
vspec actor list
vspec actor show <name>

vspec stakeholder create --name <n> [--display-name <d>] \
    [--type internal|external|regulatory]
vspec stakeholder list
vspec stakeholder show <name>

vspec goal create --actor <name> --description "<text>" \
    [--level user-goal|subfunction|summary] [--priority p0|p1|p2|p3]
vspec goal list [--actor=] [--status=]
vspec goal show <G-NNN>
vspec goal promote <G-NNN>      # shorthand for `usecase create --from <G-NNN>`
vspec goal reject <G-NNN>

vspec usecase set <KEY-NNN> --field <name> --value "<value>"
    Set a frontmatter field (title, level, format, status, priority, scope,
    frequency) on a use case, re-serializing through normalize. Body sections are
    edited with `vspec usecase apply --section`, not here.
```

## Self-Teaching Behavior

Every command — on success and on error — populates `suggested_next_actions` in
the agent envelope with the natural next command(s). Examples:

- After `vspec init` → suggest `vspec actor create`, `vspec usecase create`.
- After `vspec usecase create` → suggest
  `vspec usecase apply <KEY> --section main-success`, `vspec doctor <KEY>`.
- After a `doctor` error "primary_actor not found" → suggest
  `vspec actor create --name <name>`.

Error envelopes carry a stable `error.code` (e.g. `ACTOR_NOT_FOUND`,
`KEY_NOT_FOUND`, `INVALID_FRONTMATTER`, `MISSING_REQUIRED_SECTION`) plus a
human `message` and the recommended fix in `suggested_next_actions`.

## Filename & Key Allocation

- Use-case key: next free `<PREFIX>-<NNN>` (zero-padded to 3), scanning existing
  `specs/usecases/` filenames. Slug derived from the title (lowercase, hyphenated).
- Goal id: next free `G-<NNN>` the same way.
- Actor / stakeholder filename = `<name>.md` where `name` is the provided slug.

## What Is NOT in the CLI

No `login`, `logout`, `workspace`, `project`, `session`, `branch`, `merge`,
`lock`, `sync`, `pull`, `push`, `history`, `diff`, `revert`, `impact`, `who`,
`change`, `comment`, `api-key`, `member`. Those were server / concurrency
features. History, branching, and merging are **git's** job here.
