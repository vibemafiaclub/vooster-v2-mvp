#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, "../dist/src/cli.js");
const source = resolve(here, "../src/cli.ts");

if (existsSync(built)) {
  const { run } = await import(`file://${built}`);
  await run();
} else {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", source, ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
