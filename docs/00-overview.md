# 00 — Overview (Local-First MVP)

## What This Is

**vspec (local-first MVP)** is a command-line tool for authoring software
specifications using Alistair Cockburn's use case method. It is built for one
job: let an **AI coding agent** author, validate, and export structured use
cases as **markdown files in a git repository** — with zero server, zero
database, and zero deployment.

This is a deliberately smaller product than the full vspec vision. It exists to
reach **dogfooding as fast as possible**: the day we can write vspec's own specs
with vspec, on a laptop, offline.

## Why a New, Smaller Codebase

The original vspec codebase grew heavy because it assumed a server: PostgreSQL,
Prisma migrations, Fastify, GitHub OAuth, multi-tenant workspaces, and a
custom revision/branch/merge/lock concurrency engine. Each of those multiplied
the setup, the test harness, and the deploy surface — and pushed dogfooding far
out.

This codebase drops all of it. **The filesystem is the database. Git is the
version control. The agent is the only user.**

## First Principles

1. **Files are the source of truth.** A use case *is* a markdown file in
   `specs/`. There is no canonical copy elsewhere. The tool reads files, writes
   files, and validates files. Nothing syncs to a server because there is no
   server.
2. **Git owns history, branching, and merging.** We do not build revisions,
   branches, merges, locks, or impact analysis. `git log`, `git branch`,
   `git merge`, and `git worktree` already do this for files. (A lightweight,
   git-backed structural impact diff is a possible fast-follow — see
   [Out of Scope](#out-of-scope).)
3. **The agent is the user.** There is no web UI and no human-facing GUI in
   this MVP. Humans drive the tool *through* their coding agent. Every command
   speaks `--format=agent` (see `04-agent-envelope.md`).
4. **The CLI is the only mutation path; the agent authors the content.** LLMs are
   excellent at writing the use-case prose — but they submit it *through* the CLI
   (`vspec usecase apply` / `apply --section` / `set`), never by editing files
   under `specs/` with an Edit/Write tool. The filesystem is the current backend
   and will be replaced by a remote database, where raw file writes are
   impossible; routing every change through the CLI now keeps that transition
   seamless (and lets the CLI validate/normalize on the way in, like a PUT/PATCH).
   The CLI's job: (a) scaffold a valid skeleton (`create`), (b) accept authored
   content through validated commands (`apply`), (c) validate (`doctor`), and
   (d) export (`gherkin`).
5. **Boring and small.** No hexagonal layering, no ports/adapters ceremony, no
   plugin framework. One small package. The whole tool should be readable in an
   afternoon.

## What It Does (MVP Scope)

- Author **use cases** with full Cockburn fidelity (stakeholders & interests,
  preconditions, trigger, main success scenario, extensions, guarantees).
- Author the supporting entities: **actors**, **stakeholders**, and **goals**
  (the actor-goal backlog).
- **Validate** files offline (`vspec doctor`) against Cockburn invariants.
- **Round-trip guarantee**: `serialize(parse(file)) === normalize(file)`.
- **Export** a use case to Gherkin (`.feature`).
- **Self-teach**: `vspec ai-guide` and a `suggested_next_actions` field on every
  agent-format response.

See `03-cli-spec.md` for the exact command surface and `02-file-format.md` for
the on-disk format.

## Entities

Four file-backed entities. No UUIDs, no revision pointers, no `project_id` —
identity is human-readable and encoded in the filename.

| Entity          | Lives in                          | Identity            |
| --------------- | --------------------------------- | ------------------- |
| **UseCase**     | `specs/usecases/<KEY>-<slug>.md`  | `<PREFIX>-<NNN>`    |
| **Actor**       | `specs/actors/<name>.md`          | `name` (slug)       |
| **Stakeholder** | `specs/stakeholders/<name>.md`    | `name` (slug)       |
| **Goal**        | `specs/goals/<G-NNN>-<slug>.md`   | `G-<NNN>`           |

**Scenarios and steps are NOT separate files or entities.** They live inside the
use-case markdown body (the `Main Success Scenario` numbered list and the
`Extensions` sections) and are parsed out of it. This is the natural file-first
representation and removes an entire layer of the old data model.

**The repo is the project.** There is no multi-project / multi-workspace
concept. `vspec init --key <PREFIX>` records a single key prefix in
`.vspec/config.json`; use-case keys are `<PREFIX>-001`, `<PREFIX>-002`, …

## Tech Stack

Prescriptive, but minimal. Add a dependency only when a hand-rolled version
would be clearly worse.

| Concern        | Choice                          | Notes                                              |
| -------------- | ------------------------------- | -------------------------------------------------- |
| Language       | TypeScript 5.x (strict), ESM    | `"type": "module"`, NodeNext resolution.           |
| Runtime        | Node.js 20+                     |                                                    |
| Package manager| pnpm                            | **Single package**, no workspace.                  |
| CLI parsing    | `commander`                     | Tiny surface; no need for oclif's plugin machinery.|
| Frontmatter    | `gray-matter`                   | Parse + stringify YAML frontmatter.                |
| Frontmatter schema | `zod`                       | Validate frontmatter shape; derive TS types.       |
| Body parsing   | hand-rolled, line-based         | We need structured extraction + exact round-trip.  |
| Test runner    | `vitest`                        |                                                    |
| Format         | `prettier`, `tsc --noEmit`      | No ESLint boundaries plugin — no layering to guard.|

**Explicitly NOT used:** Fastify, Prisma, PostgreSQL, oclif, argon2, any OAuth,
`marked`, Next.js, React, Docker, testcontainers.

## Out of Scope (and why)

Cut because they require a server, multi-tenancy, or recreate what git already
does:

- Web viewer / web app / marketing site.
- HTTP API, auth (OAuth), API keys, sessions, workspaces, membership, billing.
- Custom revisions, branches, merges, locks, impact analysis, `sync`/`pull`/
  `push` — **git does this for files.**
- AI-generated use cases. Authoring here means *structured authoring* by a human
  or agent; the tool validates and scaffolds, it does not invent content.

**Possible fast-follows** (not required for dogfooding): a git-backed structural
diff that classifies a change as `COSMETIC | NON_BREAKING | BREAKING` between two
file versions; a `vspec serve` local read-only viewer.

## What "Done" Means (Dogfooding)

The MVP is done when **we can author vspec's own specs with vspec, offline**:

1. `vspec init --key VSPEC` scaffolds a repo.
2. Several real use cases for *this project* are authored via the CLI (the agent
   running `vspec usecase create` then `vspec usecase apply`), never by editing
   the files directly.
3. `vspec doctor` reports them green.
4. `serialize(parse(F)) === normalize(F)` holds for every authored file.
5. `vspec export gherkin <KEY>` produces a `.feature` for each.
6. A fresh agent that has only read `vspec ai-guide` can complete an
   end-to-end authoring task without further docs.

## How to Navigate These Docs

- `00-overview.md` (this file) — what and why.
- `01-cockburn.md` — the use case method we implement.
- `02-file-format.md` — the canonical on-disk markdown format (the contract).
- `03-cli-spec.md` — the command surface.
- `04-agent-envelope.md` — the `--format=agent` JSON contract.
- `GOAL.md` + `progress.json` — the phased build plan and its live status.
