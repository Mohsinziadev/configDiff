// Generates docs/RULES.md from the rule registry so documentation cannot drift from behaviour.
import { writeFileSync } from "node:fs";
import { listRules } from "../dist/index.js";

const rows = listRules();
let md = `# Rules

Generated from the rule registry by \`npm run docs:rules\`. Do not edit the per-rule sections by hand.

Every finding carries \`ruleId\`, \`severity\`, \`path\`, \`message\` and \`remediation\`. Messages never contain sensitive values.
Disable a rule with \`"rules": { "<id>": false }\`; override severity with \`"rules": { "<id>": { "severity": "info" } }\`.
Rules marked *needs baseline* are skipped by \`configdiff check\` / \`analyzeConfig\` without a baseline.

| Rule | Default | Severity | Needs baseline |
|---|---|---|---|
${rows.map((r) => `| [\`${r.id}\`](#${r.id}) | ${r.defaultEnabled ? "on" : r.needsOptions ? "off (needs options)" : "off"} | ${r.defaultSeverity} | ${r.needsBaseline ? "yes" : "no"} |`).join("\n")}

`;
for (const r of rows) {
  md += `## ${r.id}\n\n${r.description}\n\n- **Default:** ${r.defaultEnabled ? "enabled" : "disabled"}, severity \`${r.defaultSeverity}\`\n- **Remediation:** ${r.remediation}\n- **False positives / limitations:** ${r.limitations}\n\n`;
}
md += `## Option reference

\`\`\`jsonc
"required-keys":          { "keys": ["DATABASE_URL", "API_*"], "allowEmpty": false }
"forbidden-values":       { "items": [{ "path": "DEBUG", "equals": ["true", true] }, { "path": "*_URL", "pattern": "localhost", "message": "No localhost in production." }] }
"environment-mismatch":   { "baseline": "staging" }            // or "markers": ["staging", "dev"]
"public-secret-exposure": { "publicPrefixes": ["NEXT_PUBLIC_"] }
"watch-paths":            { "paths": [{ "path": "feature.*", "severity": "warning", "message": "Review flag changes." }] }
\`\`\`

## Path globs

\`*\` matches within one segment, \`**\` across segments, \`[*]\` any array index. Paths look like \`a.b[0].c\`. Env keys are a single segment.

## Grammar for coercion and schema checks on env strings

| Type | Accepted |
|---|---|
| integer | \`-?\\d+\` (safe integer range) |
| number | decimal with optional exponent, finite |
| boolean | exactly \`true\` or \`false\` |

Nothing else is coerced. Without \`coerce\` or a schema, env values are plain strings.

## Built-in schema

\`\`\`ts
{ type?, required?, enum?, min?, max?, minLength?, maxLength?, pattern?, properties?, items?, unknownKeys?: "allow" | "warn" | "error" }
\`\`\`

\`type\` is one of string, number, integer, boolean, null, array, object (or a list). Any [Standard Schema](https://standardschema.dev) validator (Zod 3.24+/4, Valibot, ArkType) can be passed instead.
JSON Schema is not supported in 0.1.
`;
writeFileSync(new URL("../docs/RULES.md", import.meta.url), md);
console.log(`wrote docs/RULES.md (${rows.length} rules)`);
