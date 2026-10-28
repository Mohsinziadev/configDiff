import { analyzeConfig, parseConfig } from "configdiff";

const report = analyzeConfig({
  baseline: parseConfig(stagingText, "env"),
  candidate: parseConfig(productionText, "env"),
  policy: { rules: { "environment-mismatch": { baseline: "staging" } } },
});

report.status; // "pass" | "review" | "fail"
report.findings; // safe to publish: sensitive values are not in it
