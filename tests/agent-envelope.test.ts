import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const envelopeSchema = z.object({
  format_version: z.literal(1),
  status: z.enum(["ok", "error"]),
  data: z.unknown().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  context: z.object({ project_key: z.string().nullable() }),
  affected_files: z.array(z.object({ path: z.string() })),
  dry_run: z.boolean(),
  suggested_next_actions: z.array(z.object({ command: z.string(), reason: z.string().optional() })).min(1),
  warnings: z.array(z.object({ message: z.string() })),
});

describe("agent format across commands", () => {
  it("emits valid envelopes with next actions on happy paths", () => {
    const root = join(tmpdir(), `vspec-agent-${crypto.randomUUID()}`);
    const repoRoot = resolve(import.meta.dirname, "..");
    const tsx = join(repoRoot, "node_modules/.bin/tsx");
    const cli = join(repoRoot, "src/cli.ts");
    mkdirSync(root, { recursive: true });
    const run = (...args: string[]) => {
      const output = execFileSync(tsx, [cli, ...args, "--format", "agent"], { cwd: root, encoding: "utf8" });
      const envelope = envelopeSchema.parse(JSON.parse(output));
      expect(envelope.status).toBe("ok");
      return envelope;
    };

    run("init", "--key", "VSPEC");
    run("ai-guide");
    run("actor", "create", "--name", "developer", "--display-name", "Developer");
    run("actor", "list");
    run("actor", "show", "developer");
    run("stakeholder", "create", "--name", "vooster", "--display-name", "Vooster");
    run("stakeholder", "list");
    run("stakeholder", "show", "vooster");
    const goal = run("goal", "create", "--actor", "developer", "--description", "Author a use case").data as { id: string };
    run("goal", "list");
    run("goal", "show", goal.id);
    run("goal", "reject", goal.id);
    const goalToPromote = run("goal", "create", "--actor", "developer", "--description", "Validate specs").data as { id: string };
    run("goal", "promote", goalToPromote.id);
    const created = run("usecase", "create", "--title", "Export a use case", "--primary-actor", "developer").data as { key: string };
    run("usecase", "list");
    run("usecase", "show", created.key);
    run("usecase", "set", created.key, "--field", "format", "--value", "FULLY_DRESSED");
    run("usecase", "add-stakeholder", created.key, "--stakeholder", "Vooster", "--interest", "exports are useful");
    run("scenario", "add", created.key, "--type", "extension", "--at", "1a", "--condition", "Export cannot be written");
    run("step", "add", created.key, "--actor", "system", "--action", "reports the write failure");
    run("step", "edit", created.key, "--step", "1", "--action", "requests a gherkin export");
    run("doctor", created.key);
    rmSync(root, { recursive: true, force: true });
  }, 20_000);

  it("returns KEY_NOT_FOUND with recovery suggestion", () => {
    const root = join(tmpdir(), `vspec-agent-missing-${crypto.randomUUID()}`);
    const repoRoot = resolve(import.meta.dirname, "..");
    const tsx = join(repoRoot, "node_modules/.bin/tsx");
    const cli = join(repoRoot, "src/cli.ts");
    mkdirSync(root, { recursive: true });
    execFileSync(tsx, [cli, "init", "--key", "VSPEC"], { cwd: root });
    try {
      execFileSync(tsx, [cli, "usecase", "show", "VSPEC-404", "--format", "agent"], { cwd: root, encoding: "utf8" });
      throw new Error("expected command to fail");
    } catch (error) {
      const stdout = (error as { stdout: Buffer }).stdout.toString();
      const envelope = envelopeSchema.parse(JSON.parse(stdout));
      expect(envelope.status).toBe("error");
      expect(envelope.error?.code).toBe("KEY_NOT_FOUND");
      expect(envelope.suggested_next_actions[0]?.command).toBe("vspec usecase list");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
