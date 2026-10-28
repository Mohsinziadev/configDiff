import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeConfig,
  compareConfigs,
  parseConfig,
  type ConfigFormat,
  type Policy,
} from "../../src/index.js";

const fx = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");
const load = (name: string, f: ConfigFormat) => parseConfig(fx(name), f);

describe("realistic mistakes", () => {
  const policy: Policy = {
    baselineName: "staging",
    candidateName: "production",
    rules: {
      "environment-mismatch": { baseline: "staging" },
      "watch-paths": {
        paths: [{ path: "ENABLE_AUTH", severity: "error", message: "Auth must stay enabled." }],
      },
      "required-keys": { keys: ["DATABASE_URL", "REDIS_URL"] },
    },
    coerce: { PORT: "integer" },
  };
  const report = analyzeConfig({
    baseline: load("staging.env", "env"),
    candidate: load("production.env", "env"),
    policy,
  });
  const byRule = (id: string) => report.findings.filter((f) => f.ruleId === id).map((f) => f.path);

  it("staging URL in production", () =>
    expect(byRule("environment-mismatch")).toEqual(["API_URL"]));
  it("auth disabled", () => expect(byRule("watch-paths")).toEqual(["ENABLE_AUTH"]));
  it("missing database configuration", () =>
    expect(byRule("required-keys")).toEqual(["REDIS_URL"]));
  it("invalid number", () => expect(byRule("coercion-failed")).toEqual(["PORT"]));
  it("secret exposed through public prefix", () =>
    expect(byRule("public-secret-exposure")).toEqual(["NEXT_PUBLIC_API_SECRET"]));
  it("key renamed", () => expect(byRule("possible-rename")).toEqual(["OLD_NAME"]));
  it("fails overall", () => expect(report.status).toBe("fail"));
  it("never leaks fixture secrets", () => {
    const s = JSON.stringify(report);
    for (const secret of [
      "staging-secret-value-123",
      "prod-secret-value-456",
      "hunter2pass",
      "s3cretprodpw",
    ])
      expect(s).not.toContain(secret);
  });
});

describe("YAML vs JSON vs TOML nested config", () => {
  it("detects nested timeout change and array order difference", () => {
    const base = load("app.staging.yaml", "yaml");
    const cand = load("app.production.json", "json");
    const r = compareConfigs(base, cand);
    const paths = r.changes.map((c) => `${c.type}:${c.path}`);
    expect(paths).toContain("modified:http.timeouts.read");
    expect(paths).toContain("modified:regions[0]");
    const unordered = compareConfigs(base, cand, { unordered: ["regions"] });
    expect(unordered.changes.map((c) => c.path)).not.toContain("regions");
    expect(unordered.changes.map((c) => c.path)).not.toContain("regions[0]");
  });
  it("same config in three formats compares equal", () => {
    const y = load("same.yaml", "yaml");
    expect(compareConfigs(y, load("same.json", "json")).changes).toEqual([]);
    expect(compareConfigs(y, load("same.toml", "toml")).changes).toEqual([]);
  });
});

describe("empty containers", () => {
  it("are described by their children, not double-reported", () => {
    const r = compareConfigs({ a: {} }, { a: { x: 1 } });
    expect(r.changes.map((c) => `${c.type}:${c.path}`)).toEqual(["added:a.x"]);
    expect(compareConfigs({ a: { x: 1 } }, { a: [] }).changes.map((c) => c.path)).toEqual(["a.x"]);
    expect(compareConfigs({}, { A: "1" }).changes.map((c) => c.path)).toEqual(["A"]);
  });
});
