import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression for the silent no-op bug: bin/vspec.js loads dist/src/cli.js via a
// dynamic import, so the `import.meta.url === file://argv[1]` guard never matched
// and parseAsync was never called — every command printed nothing and exited 0.
// The bin must invoke the exported run() explicitly, so the built dist path must
// actually produce output.
describe("bin entrypoint (built dist)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const bin = join(repoRoot, "bin/vspec.js");
  const built = join(repoRoot, "dist/src/cli.js");

  it("runs through bin/vspec.js against the built dist and produces output", () => {
    if (!existsSync(built)) {
      execFileSync(
        join(repoRoot, "node_modules/.bin/tsc"),
        ["-p", "tsconfig.build.json"],
        { cwd: repoRoot },
      );
    }
    const out = execFileSync("node", [bin, "ai-guide"], { encoding: "utf8" });
    expect(out).toContain("vspec AI Guide");
  }, 60_000);
});
