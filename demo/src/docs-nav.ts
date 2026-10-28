/**
 * The documentation sidebar. Each page is a Markdown file in ../../docs (`file`), rendered at build
 * time by content-plugin.ts, so GitHub and the site never drift apart.
 */
export type DocLink = { slug: string; file: string; title: string; blurb: string };
export type DocGroup = { title: string; items: DocLink[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Introduction",
    items: [
      {
        slug: "getting-started",
        file: "getting-started.md",
        title: "Getting Started",
        blurb: "Install ConfigDiff and compare your first two configs.",
      },
      {
        slug: "concepts",
        file: "concepts.md",
        title: "Core Concepts",
        blurb: "Changes, findings, formats and comparison semantics.",
      },
    ],
  },
  {
    title: "Guide",
    items: [
      { slug: "cli", file: "cli.md", title: "CLI", blurb: "Every command, flag and exit code." },
      {
        slug: "policy",
        file: "policy.md",
        title: "Policy",
        blurb: "Required keys, watched paths, coercions and severity.",
      },
      {
        slug: "rules",
        file: "RULES.md",
        title: "Rules",
        blurb: "All 15 rules with remediation and false-positive limits.",
      },
      {
        slug: "schema-validation",
        file: "schema-validation.md",
        title: "Schema Validation",
        blurb: "Built-in schemas and Standard Schema validators.",
      },
      {
        slug: "ci",
        file: "ci.md",
        title: "CI/CD",
        blurb: "Gate pull requests on risky config changes.",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        slug: "api",
        file: "API-DESIGN.md",
        title: "API Reference",
        blurb: "Functions, paths, presence, ordering and errors.",
      },
      {
        slug: "security",
        file: "SECURITY.md",
        title: "Security Model",
        blurb: "How redaction works and what it cannot guarantee.",
      },
      {
        slug: "benchmarks",
        file: "BENCHMARKS.md",
        title: "Benchmarks",
        blurb: "Measured against microdiff and deep-diff.",
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        slug: "comparison",
        file: "comparison.md",
        title: "Comparison",
        blurb: "When envalid, dotenv-diff or microdiff is the better fit.",
      },
      {
        slug: "limitations",
        file: "limitations.md",
        title: "Limitations",
        blurb: "What ConfigDiff deliberately does not do.",
      },
    ],
  },
];

export const DOC_PAGES: DocLink[] = DOC_GROUPS.flatMap((g) => g.items);
export const DEFAULT_DOC = "getting-started";
