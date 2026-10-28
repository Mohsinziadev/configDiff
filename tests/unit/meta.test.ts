import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULE_IDS, RULES, VERSION } from "../../src/index.js";

describe("package metadata", () => {
  it("VERSION matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
  it("every rule id has a registry entry and docs", () => {
    const docs = readFileSync(new URL("../../docs/RULES.md", import.meta.url), "utf8");
    for (const id of RULE_IDS) {
      expect(RULES[id].id).toBe(id);
      expect(RULES[id].remediation.length).toBeGreaterThan(10);
      expect(docs).toContain(`## ${id}`);
    }
  });
});
