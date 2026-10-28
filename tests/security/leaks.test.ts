import { inspect } from "node:util";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  analyzeConfig,
  analyzeConfigAsync,
  compareConfigs,
  compareEnv,
  formatText,
  parseConfig,
  validateConfig,
  type Policy,
} from "../../src/index.js";

// Canaries must never appear in any output.
const C = {
  key: "CANARY-key-1a2b3c",
  key2: "CANARY-key-9z8y7x",
  nested: "CANARY-nested-4d5e6f",
  arr: "CANARY-array-7g8h9i",
  url: "CANARY-urlpass-0j1k2l",
  explicit: "CANARY-explicit-3m4n5o",
  shape: "AKIAABCDEFGHIJKLMNOP",
  all: "CANARY-redactall-6p7q8r",
  enumVal: "CANARY-enum-5s6t7u",
};

const baseline = {
  JWT_SECRET: C.key,
  db: { password: C.nested, host: "h1" },
  tokens: { list: [C.arr, "x"] },
  CONN: `postgres://app:${C.url}@host/db`,
  CUSTOM: C.explicit,
  aws: C.shape,
  PLAIN: "visible-1",
  MODE: C.enumVal,
};
const candidate = {
  JWT_SECRET: C.key2,
  db: { password: C.nested + "2", host: "h2" },
  tokens: { list: [C.arr + "2", "y"] },
  CONN: `postgres://app:${C.url}2@host/db`,
  CUSTOM: C.explicit + "2",
  aws: C.shape.replace("A", "B") + "AKIAZZZZZZZZZZZZZZZZ",
  PLAIN: "visible-2",
  MODE: C.enumVal,
};
const policy: Policy = {
  sensitive: { keys: ["CUSTOM"] },
  rules: {
    "sensitive-value-changes": true,
    "sensitive-value-shared": true,
    "possible-rename": true,
  },
  schema: { properties: { MODE: { enum: ["a", "b"] }, JWT_SECRET: { type: "integer" } } },
};

function assertClean(text: string): void {
  expect(text).not.toMatch(/CANARY/);
  expect(text).not.toContain("AKIA");
}

describe("no sensitive value reaches any output", () => {
  const report = analyzeConfig({ baseline, candidate, policy });

  it("JSON report", () => assertClean(JSON.stringify(report)));
  it("text report in every verbosity", () => {
    for (const o of [{}, { quiet: true }, { verbose: true }]) assertClean(formatText(report, o));
  });
  it("util.inspect and String()", () => {
    assertClean(inspect(report, { depth: null }));
    assertClean(
      JSON.stringify(compareConfigs(baseline, candidate, { sensitive: { keys: ["CUSTOM"] } })),
    );
  });
  it("still shows non-sensitive values", () => {
    expect(JSON.stringify(report)).toContain("visible-2");
    expect(formatText(report)).toContain("visible-1");
  });
  it("marks sensitive changes as redacted", () => {
    const paths = report.changes.filter((c) => c.redacted).map((c) => c.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "JWT_SECRET",
        "db.password",
        "tokens.list[0]",
        "CONN",
        "CUSTOM",
        "aws",
      ]),
    );
    expect(paths).not.toContain("PLAIN");
  });
  it("redactAll hides everything", () => {
    const r = analyzeConfig({
      baseline: { A: C.all },
      candidate: { A: C.all + "x" },
      policy: { sensitive: { redactAll: true } },
    });
    assertClean(JSON.stringify(r) + formatText(r));
  });
  it("disabling builtin patterns still redacts by value shape and explicit keys", () => {
    const r = compareConfigs(
      { JWT_SECRET: C.key, CUSTOM: C.explicit, u: `x://a:${C.url}@h` },
      { JWT_SECRET: C.key2, CUSTOM: "n", u: "y" },
      { sensitive: { builtin: false, keys: ["CUSTOM"] } },
    );
    const text = JSON.stringify(r);
    expect(text).not.toContain(C.explicit);
    expect(text).not.toContain(C.url);
    expect(text).toContain(C.key); // builtin off and not declared: visible by design
  });
  it("sensitive keys can be globs and case-insensitive", () => {
    const r = compareConfigs(
      { Db: { Host: C.nested } },
      { Db: { Host: "z" } },
      { sensitive: { keys: ["db.*"] } },
    );
    assertClean(JSON.stringify(r));
    const r2 = compareConfigs(
      { x: { MyThing: C.nested } },
      { x: { MyThing: "z" } },
      { sensitive: { keys: ["mything"] } },
    );
    assertClean(JSON.stringify(r2));
  });
  it("custom user patterns", () => {
    const r = compareConfigs(
      { INTERNAL_X: C.nested },
      { INTERNAL_X: "z" },
      { sensitive: { patterns: ["^internal_"] } },
    );
    assertClean(JSON.stringify(r));
  });
});

describe("error paths", () => {
  it("parse errors carry no source text", () => {
    for (const [t, f] of [
      [`A=${C.key}\nbroken line`, "env"],
      [`{"k": "${C.key}",}`, "json"],
      [`k: ${C.key}\n  bad: [`, "yaml"],
      [`k = "${C.key}"\nbad = `, "toml"],
    ] as const) {
      try {
        parseConfig(t, f);
        expect.unreachable();
      } catch (e) {
        assertClean(
          String(e) + JSON.stringify(e) + inspect(e) + ((e as Error).stack ?? "").split("\n")[0],
        );
      }
    }
  });
  it("ParsedConfig does not serialize or inspect values", () => {
    const p = parseConfig(`SECRET=${C.key}`, "env");
    assertClean(JSON.stringify(p));
    assertClean(inspect(p, { depth: null }));
    assertClean(JSON.stringify({ p }));
  });
  it("schema violations on sensitive keys hide details", () => {
    const r = validateConfig(
      { API_TOKEN: C.key },
      { properties: { API_TOKEN: { type: "integer", enum: [1] } } },
    );
    expect(r.findings.length).toBeGreaterThan(0);
    assertClean(JSON.stringify(r));
  });
  it("Standard Schema (zod) messages are scrubbed of sensitive values", () => {
    const schema = z.object({
      API_TOKEN: z.string().refine((v) => v === "nope", { message: `bad ${C.key}` }),
      MODE: z.enum(["a", "b"]),
    });
    const r = validateConfig({ API_TOKEN: C.key, MODE: C.enumVal }, schema as never);
    expect(r.findings.length).toBe(2);
    assertClean(JSON.stringify(r));
  });
  it("async validators require the async API", async () => {
    const schema = {
      "~standard": { validate: async () => ({ issues: [{ message: `x ${C.key}`, path: ["K"] }] }) },
    };
    expect(() => validateConfig({ K: C.key }, schema)).toThrow(/async/i);
    const r = await analyzeConfigAsync({
      candidate: { K: C.key },
      policy: { schema, sensitive: { keys: ["K"] } },
    });
    assertClean(JSON.stringify(r));
  });
  it("rule option errors do not echo config", () => {
    try {
      analyzeConfig({
        candidate: { A: C.key },
        policy: { rules: { "forbidden-values": { items: [{ path: "A", pattern: "(" }] } } },
      });
      expect.unreachable();
    } catch (e) {
      assertClean(String(e));
    }
  });
  it("compareEnv with sensitive values", () => {
    assertClean(JSON.stringify(compareEnv(`API_SECRET=${C.key}`, `API_SECRET=${C.key2}`)));
  });
  it("custom policy messages are scrubbed if they echo a sensitive value", () => {
    const r = analyzeConfig({
      candidate: { API_SECRET: C.key },
      policy: {
        rules: {
          "forbidden-values": {
            items: [{ path: "API_SECRET", equals: [C.key], message: `found ${C.key}` }],
          },
        },
      },
    });
    expect(r.findings).toHaveLength(1);
    assertClean(JSON.stringify(r));
  });
});
