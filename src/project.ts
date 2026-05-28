import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { orderActorFrontmatter, orderStakeholderFrontmatter, stringifyFrontmatter } from "./format/frontmatter.js";
import { slugify } from "./slug.js";

export function initProject(args: { root?: string; key?: string }) {
  const root = resolve(args.root ?? process.cwd());
  const prefix = (args.key ?? slugify(basename(root)).replace(/-/g, "_")).toUpperCase();
  const affectedFiles: string[] = [];
  for (const dir of [".vspec", "specs/actors", "specs/stakeholders", "specs/goals", "specs/usecases"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  const configPath = join(root, ".vspec/config.json");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${JSON.stringify({ vspec_format: 1, key_prefix: prefix }, null, 2)}\n`);
    affectedFiles.push(".vspec/config.json");
  }

  const systemActor = join(root, "specs/actors/system.md");
  if (!existsSync(systemActor)) {
    writeFileSync(
      systemActor,
      stringifyFrontmatter(
        orderActorFrontmatter({
          vspec_format: 1,
          type: "actor",
          name: "system",
          display_name: "System",
          actor_type: "SUPPORTING",
          is_human: false,
        }),
        "The system under specification.\n",
      ),
    );
    affectedFiles.push("specs/actors/system.md");
  }

  const projectStakeholder = join(root, "specs/stakeholders/project-team.md");
  if (!existsSync(projectStakeholder)) {
    writeFileSync(
      projectStakeholder,
      stringifyFrontmatter(
        orderStakeholderFrontmatter({
          vspec_format: 1,
          type: "stakeholder",
          name: "project-team",
          display_name: "Project Team",
          stakeholder_type: "INTERNAL",
        }),
        "The team responsible for the repository.\n",
      ),
    );
    affectedFiles.push("specs/stakeholders/project-team.md");
  }

  return {
    root,
    key_prefix: JSON.parse(readFileSync(configPath, "utf8")).key_prefix as string,
    affectedFiles,
  };
}
