import { describe, expect, it } from "vitest";
import {
  analyzeConfig,
  validateConfig,
  parseConfig,
  ConfigDiffError,
  type Policy,
  type RuleId,
} from "../../src/index.js";

const ids = (r: { findings: Array<{ ruleId: RuleId }> }): RuleId[] =>
  r.findings.map((f) => f.ruleId);
const run = (b: unknown, c: unknown, policy: Policy = {}) =>
  analyzeConfig({ baseline: b, candidate: c, policy });

describe("default rules", () => {
  it("missing-in-candidate: detects removal, ignores addition", () => {
    expect(ids(run({ A: "1" }, {}))).toContain("missing-in-candidate");
    expect(ids(run({}, { A: "1" }))).not.toContain("missing-in-candidate");
  });
  it("type-mismatch: detects number→string, ignores same-type change", () => {
    expect(ids(run({ p: 1 }, { p: "1" }))).toContain("type-mismatch");
    expect(ids(run({ p: 1 }, { p: 2 }))).not.toContain("type-mismatch");
  });
  it("empty-value: empty API key vs untouched empty", () => {
    expect(ids(run({ k: "abc" }, { k: "" }))).toContain("empty-value");
    expect(ids(run({ k: "" }, { k: "" }))).toEqual([]);
    expect(ids(run({ k: "" }, { k: "x" }))).toEqual([]);
  });
  it("possible-rename: unique identical long value only", () => {
    expect(ids(run({ OLD: "same-long-value" }, { NEW: "same-long-value" }))).toContain(
      "possible-rename",
    );
    expect(ids(run({ OLD: "true" }, { NEW: "true" }))).not.toContain("possible-rename");
    expect(
      ids(run({ A: "same-long-value", B: "same-long-value" }, { C: "same-long-value" })),
    ).not.toContain("possible-rename");
  });
  it("public-secret-exposure: flags secrets, not publishable keys", () => {
    expect(ids(analyzeConfig({ candidate: { NEXT_PUBLIC_STRIPE_SECRET: "x" } }))).toContain(
      "public-secret-exposure",
    );
    expect(ids(analyzeConfig({ candidate: { VITE_DB_PASSWORD: "x" } }))).toContain(
      "public-secret-exposure",
    );
    expect(
      ids(analyzeConfig({ candidate: { NEXT_PUBLIC_STRIPE_KEY: "pk_live_x" } })),
    ).not.toContain("public-secret-exposure");
    expect(ids(analyzeConfig({ candidate: { DB_PASSWORD: "x" } }))).not.toContain(
      "public-secret-exposure",
    );
  });
  it("credential-in-url: flags embedded credentials only", () => {
    expect(ids(analyzeConfig({ candidate: { U: "postgres://u:p@h/db" } }))).toContain(
      "credential-in-url",
    );
    expect(ids(analyzeConfig({ candidate: { U: "https://example.com/a:b@c" } }))).not.toContain(
      "credential-in-url",
    );
  });
  it("duplicate-keys from env parse", () => {
    const r = analyzeConfig({ candidate: parseConfig("A=1\nA=2", "env") });
    expect(ids(r)).toContain("duplicate-keys");
  });
  it("coercion-failed on invalid value, not on valid", () => {
    expect(ids(run({ PORT: "1" }, { PORT: "abc" }, { coerce: { PORT: "integer" } }))).toContain(
      "coercion-failed",
    );
    expect(ids(run({ PORT: "1" }, { PORT: "2" }, { coerce: { PORT: "integer" } }))).not.toContain(
      "coercion-failed",
    );
  });
  it("rules can be disabled and severities overridden", () => {
    expect(ids(run({ A: "1" }, {}, { rules: { "missing-in-candidate": false } }))).toEqual([]);
    const r = run({ A: "1" }, {}, { rules: { "missing-in-candidate": { severity: "error" } } });
    expect(r.findings[0]?.severity).toBe("error");
    expect(r.status).toBe("fail");
  });
  it("harmless changes produce no findings", () => {
    const r = run({ A: "x", T: 5 }, { A: "y", T: 6 });
    expect(r.findings).toEqual([]);
    expect(r.status).toBe("pass");
  });
});

describe("configured rules", () => {
  it("required-keys: missing, empty, allowEmpty, wildcard", () => {
    const rules = { "required-keys": { keys: ["DB_URL", "API_*"] } } as const;
    const r = analyzeConfig({ candidate: { API_KEY: "" }, policy: { rules } });
    expect(r.findings.map((f) => `${f.path}:${f.message}`)).toEqual([
      "API_*:Required key is present but empty.",
      "DB_URL:Required key is missing.",
    ]);
    const ok = analyzeConfig({
      candidate: { DB_URL: "x", API_KEY: "" },
      policy: { rules: { "required-keys": { keys: ["API_KEY"], allowEmpty: true } } },
    });
    expect(ok.findings).toEqual([]);
  });
  it("forbidden-values: equals and pattern", () => {
    const rules = {
      "forbidden-values": {
        items: [
          { path: "DEBUG", equals: ["true", true] },
          { path: "*_URL", pattern: "localhost" },
        ],
      },
    };
    const r = analyzeConfig({
      candidate: { DEBUG: "true", API_URL: "http://localhost:1", OK_URL: "https://x" },
      policy: { rules },
    });
    expect(r.findings.map((f) => f.path)).toEqual(["API_URL", "DEBUG"]);
  });
  it("environment-mismatch: staging marker in production value, word-bounded", () => {
    const rules = { "environment-mismatch": { baseline: "staging" } };
    const r = analyzeConfig({
      candidate: {
        A: "https://api.staging.example.com",
        B: "https://stagingarea.example.com",
        C: "prod",
      },
      policy: { rules },
    });
    expect(r.findings.map((f) => f.path)).toEqual(["A"]);
    expect(() =>
      analyzeConfig({ candidate: {}, policy: { rules: { "environment-mismatch": {} } } }),
    ).toThrow(ConfigDiffError);
  });
  it("watch-paths: per-path severity (auth disabled)", () => {
    const rules = {
      "watch-paths": {
        paths: [{ path: "ENABLE_AUTH", severity: "error" as const, message: "Auth must stay on." }],
      },
    };
    const r = run({ ENABLE_AUTH: "true", X: "1" }, { ENABLE_AUTH: "false", X: "2" }, { rules });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ severity: "error", path: "ENABLE_AUTH" });
    expect(r.changes.find((c) => c.path === "ENABLE_AUTH")?.ruleIds).toEqual(["watch-paths"]);
    expect(r.status).toBe("fail");
  });
  it("sensitive-value-changes / shared", () => {
    const rules = { "sensitive-value-changes": true, "sensitive-value-shared": true } as const;
    const r = run(
      { A_SECRET: "one-1111", B_SECRET: "same-2222" },
      { A_SECRET: "two-2222", B_SECRET: "same-2222" },
      { rules },
    );
    expect(r.findings.map((f) => `${f.ruleId}:${f.path}`)).toEqual([
      "sensitive-value-changes:A_SECRET",
      "sensitive-value-shared:B_SECRET",
    ]);
  });
  it("rules needing options reject empty config", () => {
    expect(() =>
      analyzeConfig({ candidate: {}, policy: { rules: { "required-keys": true } } }),
    ).toThrow(/requires/);
  });
  it("comparison rules are skipped in check mode", () => {
    const r = analyzeConfig({
      candidate: { A: "" },
      policy: { rules: { "sensitive-value-changes": true } },
    });
    expect(r.mode).toBe("check");
    expect(r.findings).toEqual([]);
  });
  it("failOn thresholds drive status", () => {
    const base = { A: "1" };
    expect(run(base, {}, { failOn: "warning" }).status).toBe("fail");
    expect(run(base, {}, { failOn: "error" }).status).toBe("review");
    expect(run(base, {}, { failOn: "never" }).status).toBe("review");
  });
});

describe("schema", () => {
  const schema = {
    properties: {
      PORT: { type: "integer", min: 1, max: 65535, required: true },
      MODE: { enum: ["a", "b"] },
      NAME: { type: "string", minLength: 3, pattern: "^[a-z]+$" },
      FLAG: { type: "boolean" },
    },
    unknownKeys: "warn",
  } as const;
  it("validates env strings with the documented grammar", () => {
    const good = validateConfig(
      parseConfig("PORT=8080\nFLAG=true\nNAME=abc\nMODE=a", "env"),
      schema,
    );
    expect(good.findings).toEqual([]);
    const bad = validateConfig(
      parseConfig("PORT=70000\nFLAG=yes\nNAME=AB\nMODE=z\nEXTRA=1", "env"),
      schema,
    );
    expect(bad.findings.map((f) => f.path)).toEqual([
      "EXTRA",
      "FLAG",
      "MODE",
      "NAME",
      "NAME",
      "PORT",
    ]);
    expect(bad.findings.find((f) => f.path === "EXTRA")?.severity).toBe("warning");
  });
  it("does not coerce non-env values", () => {
    const r = validateConfig({ PORT: "8080" }, schema);
    expect(r.findings.some((f) => f.path === "PORT" && /Expected integer/.test(f.message))).toBe(
      true,
    );
  });
  it("reports missing required and invalid ports", () => {
    expect(validateConfig({}, schema).findings.map((f) => f.message)).toContain(
      "Required value is missing",
    );
  });
  it("rejects malformed schemas", () => {
    expect(() => validateConfig({}, { type: "strng" } as never)).toThrow(ConfigDiffError);
  });
  it("nested objects and arrays", () => {
    const r = validateConfig(
      { s: { t: [1, "x"] } },
      { properties: { s: { properties: { t: { items: { type: "number" } } } } } },
    );
    expect(r.findings.map((f) => f.path)).toEqual(["s.t[1]"]);
  });
});
