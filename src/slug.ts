export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function displayToSlug(value: string): string {
  return slugify(value);
}

// Human-readable filename slug. Unlike `slugify` (a strict ASCII identifier for
// names/keys), this keeps Unicode letters/numbers so Korean titles — the default
// language — produce meaningful filenames instead of an empty slug.
export function fileSlug(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
