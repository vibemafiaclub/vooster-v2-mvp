import type {
  ExtensionOutcome,
  ParsedUseCase,
  StakeholderInterest,
  UseCaseExtension,
} from "../domain/types.js";
import { parseMatter, parseUseCaseFrontmatter } from "./frontmatter.js";

const SECTION_ORDER = [
  "Stakeholders and Interests",
  "Preconditions",
  "Trigger",
  "Main Success Scenario",
  "Extensions",
  "Success Guarantee",
  "Minimal Guarantee",
  "Notes",
] as const;

type SectionName = (typeof SECTION_ORDER)[number];

export type UseCaseBody = Omit<ParsedUseCase, "frontmatter">;

export type BodySection =
  | "blurb"
  | "stakeholders"
  | "preconditions"
  | "trigger"
  | "main-success"
  | "extensions"
  | "success-guarantee"
  | "minimal-guarantee"
  | "notes";

export const BODY_SECTIONS: BodySection[] = [
  "blurb",
  "stakeholders",
  "preconditions",
  "trigger",
  "main-success",
  "extensions",
  "success-guarantee",
  "minimal-guarantee",
  "notes",
];

export function parseUseCaseMarkdown(text: string): ParsedUseCase {
  const { data, content } = parseMatter(text);
  const frontmatter = parseUseCaseFrontmatter(data);
  return { frontmatter, ...parseUseCaseBody(content, frontmatter.title) };
}

export function parseUseCaseBody(content: string, fallbackTitle: string): UseCaseBody {
  const lines = trimTrailingWhitespace(content).split("\n");
  const titleLineIndex = lines.findIndex((line) => line.startsWith("# "));
  const title = titleLineIndex >= 0 ? lines[titleLineIndex].slice(2).trim() : fallbackTitle;
  const afterTitle = titleLineIndex >= 0 ? lines.slice(titleLineIndex + 1) : lines;
  const firstSection = afterTitle.findIndex((line) => line.startsWith("## "));
  const intro = firstSection >= 0 ? afterTitle.slice(0, firstSection) : afterTitle;
  const blurb = parseBlurb(intro);
  const sections = splitSections(firstSection >= 0 ? afterTitle.slice(firstSection) : []);

  return {
    title,
    blurb,
    stakeholderInterests: parseStakeholderInterests(sections.get("Stakeholders and Interests") ?? []),
    preconditions: parseBullets(sections.get("Preconditions") ?? []),
    trigger: parseParagraph(sections.get("Trigger") ?? []),
    mainSuccess: parseMainSuccess(sections.get("Main Success Scenario") ?? []),
    extensions: parseExtensions(sections.get("Extensions") ?? []),
    successGuarantee: parseParagraph(sections.get("Success Guarantee") ?? []),
    minimalGuarantee: parseParagraph(sections.get("Minimal Guarantee") ?? []),
    notes: parseVerbatim(sections.get("Notes") ?? []),
  };
}

// Replace a single section's content on a use case from the raw text an agent
// submits via `vspec usecase apply --section`. The text is the section body only
// (no `## Heading`), in the same line format the parser reads from a full file.
export function applyBodySection(body: UseCaseBody, section: BodySection, text: string): void {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  switch (section) {
    case "blurb":
      body.blurb = text.trim() ? text.trim() : null;
      return;
    case "stakeholders":
      body.stakeholderInterests = parseStakeholderInterests(lines);
      return;
    case "preconditions":
      body.preconditions = parseBullets(lines);
      return;
    case "trigger":
      body.trigger = parseParagraph(lines);
      return;
    case "main-success":
      body.mainSuccess = parseMainSuccess(lines);
      return;
    case "extensions":
      body.extensions = parseExtensions(lines);
      return;
    case "success-guarantee":
      body.successGuarantee = parseParagraph(lines);
      return;
    case "minimal-guarantee":
      body.minimalGuarantee = parseParagraph(lines);
      return;
    case "notes":
      body.notes = parseVerbatim(lines);
      return;
  }
}

function trimTrailingWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

function parseBlurb(lines: string[]): string | null {
  const blockquote = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">"))
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
  return blockquote.length > 0 ? blockquote : null;
}

function splitSections(lines: string[]): Map<SectionName, string[]> {
  const sections = new Map<SectionName, string[]>();
  let current: SectionName | null = null;
  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = SECTION_ORDER.includes(heading[1] as SectionName) ? (heading[1] as SectionName) : null;
      if (current && !sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return sections;
}

function parseStakeholderInterests(lines: string[]): StakeholderInterest[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .map((line) => {
      const match = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
      if (!match) return { stakeholder: "", interest: line, protectionMechanism: null };
      const protectionMatch = match[2].match(/\s*_\((?:Protected by):\s*(.+?)\)_\s*$/i);
      const interest = protectionMatch ? match[2].slice(0, protectionMatch.index).trim() : match[2].trim();
      return {
        stakeholder: match[1].trim(),
        interest,
        protectionMechanism: protectionMatch ? protectionMatch[1].trim() : null,
      };
    });
}

function parseBullets(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseParagraph(lines: string[]): string | null {
  const paragraph = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return paragraph.length > 0 ? paragraph : null;
}

function parseVerbatim(lines: string[]): string | null {
  const text = lines.join("\n").replace(/^\n+|\n+$/g, "");
  return text.length > 0 ? text : null;
}

function parseStepText(text: string): { actor: string; action: string } {
  const match = text.match(/^\*\*(.+?)\*\*\s+(.+)$/);
  return match ? { actor: match[1].trim(), action: match[2].trim() } : { actor: "", action: text.trim() };
}

function parseMainSuccess(lines: string[]): { number: number; actor: string; action: string }[] {
  return lines
    .map((line) => line.trim())
    .map((line) => line.match(/^(\d+)\.\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ number: Number(match[1]), ...parseStepText(match[2]) }));
}

function parseExtensions(lines: string[]): UseCaseExtension[] {
  const extensions: UseCaseExtension[] = [];
  let current: UseCaseExtension | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^### (\d+[a-z]|\*[a-z])\.\s+(.+)$/i);
    if (heading) {
      current = {
        point: heading[1],
        condition: heading[2].trim(),
        steps: [],
        outcome: "FAILURE",
        rejoinStep: null,
      };
      extensions.push(current);
      continue;
    }
    if (!current || !line.startsWith("- ")) continue;
    const bullet = line.slice(2).trim();
    const outcome = parseOutcome(bullet);
    if (outcome) {
      current.outcome = outcome.outcome;
      current.rejoinStep = outcome.rejoinStep;
      continue;
    }
    const step = bullet.match(/^((?:\d+[a-z]|\*[a-z])\d+)\.\s+(.+)$/i);
    if (step) {
      current.steps.push({ id: step[1], ...parseStepText(step[2]) });
    }
  }
  return extensions;
}

function parseOutcome(text: string): { outcome: ExtensionOutcome; rejoinStep: number | null } | null {
  const match = text.match(/^\(Outcome:\s*(SUCCESS|FAILURE|PARTIAL)\s*(?:—|-)?\s*(.*?)\)$/i);
  if (!match) return null;
  const rejoin = match[2].match(/rejoins main at step\s+(\d+)/i);
  return {
    outcome: match[1].toUpperCase() as ExtensionOutcome,
    rejoinStep: rejoin ? Number(rejoin[1]) : null,
  };
}
