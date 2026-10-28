import {
  analyzeConfig,
  compareConfigs,
  compareEnv,
  parseConfig,
  validateConfig,
} from "configdiff-js";

// 1. Structural comparison of plain objects.
const { changes } = compareConfigs(
  { API_URL: "https://staging.example.com", PORT: 3000, ENABLE_AUTH: true },
  { API_URL: "https://production.example.com", PORT: 3000, ENABLE_AUTH: false },
);
console.log(changes.map((c) => `${c.type} ${c.path}: ${c.explanation}`).join("\n"));

// 2. Env files: sensitive values are redacted in every output.
const env = compareEnv(
  "JWT_SECRET=abc-staging-123\nPORT=3000",
  "JWT_SECRET=xyz-prod-456\nPORT=3001",
);
console.log(JSON.stringify(env.changes.map((c) => [c.path, c.redacted])));

// 3. Policy: fail on auth being disabled and on staging markers in production values.
const report = analyzeConfig({
  baseline: parseConfig("ENABLE_AUTH=true\nAPI_URL=https://staging.example.com", "env"),
  candidate: parseConfig("ENABLE_AUTH=false\nAPI_URL=https://api.staging.example.com", "env"),
  policy: {
    baselineName: "staging",
    candidateName: "production",
    rules: {
      "environment-mismatch": { baseline: "staging" },
      "watch-paths": {
        paths: [{ path: "ENABLE_AUTH", severity: "error", message: "Auth must stay enabled." }],
      },
    },
  },
});
console.log(report.status, report.findings.map((f) => `${f.ruleId}@${f.path}`).join(", "));
if (report.status !== "fail") throw new Error("expected a failing report");

// 4. Schema validation (built-in schema; env strings use the documented grammar).
const v = validateConfig(parseConfig("PORT=99999", "env"), {
  properties: { PORT: { type: "integer", min: 1, max: 65535 } },
});
console.log(v.findings[0]?.message);
