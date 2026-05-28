import { basename } from "node:path";
import { walkFiles } from "./files.js";

export function nextUseCaseKey(prefix: string, usecaseDir: string): string {
  return `${prefix}-${nextNumber(usecaseDir, new RegExp(`^${escapeRegex(prefix)}-(\\d{3})-.*\\.md$`))}`;
}

export function nextGoalId(goalDir: string): string {
  return `G-${nextNumber(goalDir, /^G-(\d{3})-.*\.md$/)}`;
}

function nextNumber(dir: string, pattern: RegExp): string {
  const used = new Set<number>();
  for (const file of walkFiles(dir, (path) => path.endsWith(".md"))) {
    const match = basename(file).match(pattern);
    if (match) used.add(Number(match[1]));
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return String(next).padStart(3, "0");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
