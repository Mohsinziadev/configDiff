import { describe, expect, it } from "vitest";
import { compareConfigs, compareEnv } from "../../src/index.js";

describe("compareConfigs", () => {
  it("reports added, removed and modified with paths", () => {
    const r = compareConfigs(
      { a: 1, b: { c: 1, d: 2 }, gone: true },
      { a: 2, b: { c: 1, e: 3 }, new: 1 },
    );
    expect(r.changes.map((c) => `${c.type}:${c.path}`)).toEqual([
      "modified:a",
      "removed:b.d",
      "added:b.e",
      "removed:gone",
      "added:new",
    ]);
    expect(r.summary).toMatchObject({ added: 2, removed: 2, modified: 1 });
  });

  it("has no changes for identical configs regardless of key order", () => {
    expect(compareConfigs({ a: 1, b: 2 }, { b: 2, a: 1 }).changes).toEqual([]);
  });

  it("distinguishes absent, empty string and null", () => {
    const r = compareConfigs({ a: "", b: null }, { b: "", c: null });
    const byPath = Object.fromEntries(r.changes.map((c) => [c.path, c]));
    expect(byPath.a?.type).toBe("removed");
    expect(byPath.b?.type).toBe("modified");
    expect(byPath.b?.typeChanged).toBe(true);
    expect(byPath.c?.type).toBe("added");
  });

  it("compares arrays by index by default", () => {
    const r = compareConfigs({ l: [1, 2] }, { l: [2, 1] });
    expect(r.changes.map((c) => c.path)).toEqual(["l[0]", "l[1]"]);
  });

  it("compares arrays as multisets when declared unordered", () => {
    const same = compareConfigs({ l: [1, 2, 2] }, { l: [2, 1, 2] }, { unordered: ["l"] });
    expect(same.changes).toEqual([]);
    const diff = compareConfigs({ l: [1, 2] }, { l: [2, 3] }, { unordered: ["l"] });
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.arrayDelta).toEqual({ added: 1, removed: 1 });
  });

  it("handles empty containers and unordered arrays of objects", () => {
    expect(compareConfigs({ a: [], o: {} }, { a: [], o: {} }).changes).toEqual([]);
    const r = compareConfigs(
      { l: [{ x: 1, y: 2 }] },
      { l: [{ y: 2, x: 1 }] },
      { unordered: ["l"] },
    );
    expect(r.changes).toEqual([]);
  });

  it("applies ignore globs", () => {
    const r = compareConfigs(
      { a: { x: 1, y: 1 }, b: 1 },
      { a: { x: 2, y: 2 }, b: 2 },
      { ignore: ["a.*", "b"] },
    );
    expect(r.changes).toEqual([]);
  });

  it("is deterministic and sorts numerically inside arrays", () => {
    const base = { l: Array.from({ length: 12 }, (_, i) => i) };
    const cand = { l: Array.from({ length: 12 }, (_, i) => i + 1) };
    const paths = compareConfigs(base, cand).changes.map((c) => c.path);
    expect(paths.slice(0, 3)).toEqual(["l[0]", "l[1]", "l[2]"]);
    expect(JSON.stringify(compareConfigs(base, cand))).toBe(
      JSON.stringify(compareConfigs(base, cand)),
    );
  });

  it("does not mutate inputs", () => {
    const a = { x: { y: [1, 2] } };
    const snap = structuredClone(a);
    compareConfigs(a, { x: { y: [3] } });
    expect(a).toEqual(snap);
  });

  it("is safe with __proto__ keys", () => {
    const a = JSON.parse('{"__proto__": {"polluted": true}}');
    const r = compareConfigs(a, {});
    expect(r.changes[0]?.path).toBe("__proto__.polluted");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects unsupported value types with a useful error", () => {
    expect(() => compareConfigs({ a: () => 1 }, {})).toThrow(/Unsupported value type/);
  });
});

describe("normalization", () => {
  it("normalizes newlines by default and can be disabled", () => {
    expect(compareConfigs({ k: "a\r\nb" }, { k: "a\nb" }).changes).toEqual([]);
    expect(
      compareConfigs({ k: "a\r\nb" }, { k: "a\nb" }, { normalizeNewlines: false }).changes,
    ).toHaveLength(1);
  });

  it("trims only declared paths", () => {
    expect(compareConfigs({ a: " x" }, { a: "x" }).changes).toHaveLength(1);
    expect(compareConfigs({ a: " x" }, { a: "x" }, { trim: ["a"] }).changes).toEqual([]);
  });

  it("coerces only declared paths and keeps type info otherwise", () => {
    expect(compareEnv("PORT=3000", "PORT=3000.0").changes).toHaveLength(1);
    expect(compareEnv("PORT=3000", "PORT=3000", { coerce: { PORT: "integer" } }).changes).toEqual(
      [],
    );
    expect(
      compareConfigs({ p: 3000 }, { p: "3000" }, { coerce: { p: "integer" } }).changes,
    ).toEqual([]);
    expect(compareConfigs({ p: 3000 }, { p: "3000" }).changes[0]?.typeChanged).toBe(true);
  });
});

describe("compareEnv", () => {
  it("never interprets strings as booleans or numbers", () => {
    const r = compareEnv("A=true\nB=1", "A=false\nB=01");
    expect(r.changes.every((c) => c.baseline.present && c.baseline.type === "string")).toBe(true);
  });
  it("accepts maps", () => {
    expect(compareEnv({ A: "1" }, { A: "2" }).changes).toHaveLength(1);
  });
});
