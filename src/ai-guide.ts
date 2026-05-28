export function aiGuideText(): string {
  return [
    "# vspec AI Guide",
    "",
    "1. Run `vspec init --key VSPEC` in the repository root.",
    "2. Create referenced actors with `vspec actor create --name developer --display-name \"Developer\"`.",
    "3. Create referenced stakeholders with `vspec stakeholder create --name vooster --display-name \"Vooster\"`.",
    "4. Start a use case with `vspec usecase create --title \"Author a use case\" --primary-actor developer`.",
    "5. Edit the markdown directly or use `vspec usecase add-stakeholder`, `vspec step add`, and `vspec usecase set`.",
    "6. Run `vspec doctor <KEY>` until there are no errors.",
    "7. Export with `vspec export gherkin <KEY>` when the use case is ready.",
    "",
    "Files under `specs/` are the source of truth. Do not use a server, database, or network service.",
  ].join("\n");
}
