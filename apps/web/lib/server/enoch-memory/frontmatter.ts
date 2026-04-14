export type FrontmatterValue = string | string[] | boolean | number | null;
export type FrontmatterRecord = Record<string, FrontmatterValue>;

export const parseFrontmatter = (markdown: string): { frontmatter: FrontmatterRecord; body: string } => {
  if (!markdown.startsWith("---\n")) {
    return { frontmatter: {}, body: markdown };
  }

  const endIndex = markdown.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { frontmatter: {}, body: markdown };
  }

  const rawFrontmatter = markdown.slice(4, endIndex).split("\n");
  const frontmatter: FrontmatterRecord = {};

  for (const line of rawFrontmatter) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    if (rawValue === "true" || rawValue === "false") {
      frontmatter[key] = rawValue === "true";
      continue;
    }

    if (rawValue === "null") {
      frontmatter[key] = null;
      continue;
    }

    const numeric = Number(rawValue);
    frontmatter[key] = Number.isFinite(numeric) && rawValue !== "" ? numeric : rawValue;
  }

  return {
    frontmatter,
    body: markdown.slice(endIndex + 5)
  };
};

export const stringifyFrontmatter = (frontmatter: FrontmatterRecord, body: string) => {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) {
    return body;
  }

  const serialized = entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: [${value.join(", ")}]`;
    }

    return `${key}: ${value ?? "null"}`;
  });

  return `---\n${serialized.join("\n")}\n---\n${body}`;
};
