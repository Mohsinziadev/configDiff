import { describe, expect, it } from "vitest";
import { ConfigDiffError, detectFormat, parseConfig } from "../../src/index.js";

const val = (text: string, f: "env" | "json" | "yaml" | "toml"): unknown =>
  parseConfig(text, f).value;

describe("env", () => {
  it("parses quotes, comments, export and empty values", () => {
    const text = `# c\nexport A=1\nB="x y" # trailing\nC='lit $A'\nD=\nE=has # comment\nF="multi\nline"\nG="a\\nb"\n`;
    expect(val(text, "env")).toEqual({
      A: "1",
      B: "x y",
      C: "lit $A",
      D: "",
      E: "has",
      F: "multi\nline",
      G: "a\nb",
    });
  });
  it("handles CRLF and BOM", () => {
    expect(val("﻿A=1\r\nB=2\r\n", "env")).toEqual({ A: "1", B: "2" });
  });
  it("records duplicates, last wins", () => {
    const p = parseConfig("A=1\nA=2", "env");
    expect(p.value).toEqual({ A: "2" });
    expect(p.duplicateKeys).toEqual(["A"]);
  });
  it("reports line numbers without echoing content", () => {
    try {
      parseConfig("A=1\nSECRETLINEWITHOUTEQUALS\n", "env");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigDiffError);
      expect((e as ConfigDiffError).location?.line).toBe(2);
      expect(JSON.stringify(e)).not.toContain("SECRETLINE");
      expect((e as Error).message).not.toContain("SECRETLINE");
    }
  });
  it("rejects unterminated quotes", () => {
    expect(() => parseConfig('A="oops', "env")).toThrow(/unterminated/);
  });
});

describe("json / yaml / toml", () => {
  it("parses each format to the same structure", () => {
    const expected = { server: { port: 80, tags: ["a", "b"] }, on: true };
    expect(val('{"server":{"port":80,"tags":["a","b"]},"on":true}', "json")).toEqual(expected);
    expect(val("server:\n  port: 80\n  tags: [a, b]\non: true\n", "yaml")).toEqual(expected);
    expect(val('on = true\n[server]\nport = 80\ntags = ["a","b"]\n', "toml")).toEqual(expected);
  });
  it("converts TOML datetimes to strings", () => {
    expect(val("t = 2026-01-02T03:04:05Z", "toml")).toEqual({ t: "2026-01-02T03:04:05.000Z" });
  });
  it("gives locations for syntax errors and no source text", () => {
    for (const [text, fmt] of [
      ['{\n  "pw": "hunter2",\n}', "json"],
      ["a: [1, 2\nb: hunter2\n", "yaml"],
      ['a = "hunter2"\nb = \n', "toml"],
    ] as const) {
      try {
        parseConfig(text, fmt);
        expect.unreachable();
      } catch (e) {
        expect((e as ConfigDiffError).code).toBe("PARSE_ERROR");
        expect((e as ConfigDiffError).location?.line).toBeGreaterThan(0);
        expect(JSON.stringify(e)).not.toContain("hunter2");
        expect(String(e)).not.toContain("hunter2");
      }
    }
  });
  it("rejects duplicate YAML keys and scalar roots", () => {
    expect(() => parseConfig("a: 1\na: 2\n", "yaml")).toThrow(ConfigDiffError);
    expect(() => parseConfig("42", "json")).toThrow(/object or array/);
  });
  it("treats an empty YAML document as empty config", () => {
    expect(val("", "yaml")).toEqual({});
  });
  it("survives alias bombs without hanging", () => {
    let y = "a0: &a0 [x,x,x,x,x,x,x,x,x,x]\n";
    for (let i = 1; i < 12; i++)
      y += `a${i}: &a${i} [${Array(10)
        .fill(`*a${i - 1}`)
        .join(",")}]\n`;
    expect(() => parseConfig(y, "yaml")).toThrow(ConfigDiffError);
  });
  it("enforces the input size limit", () => {
    expect(() => parseConfig("a=" + "x".repeat(6 * 1024 * 1024), "env")).toThrow(/exceeds/);
  });
});

describe("detectFormat", () => {
  it("detects by name", () => {
    expect(detectFormat(".env.production")).toBe("env");
    expect(detectFormat("app.env")).toBe("env");
    expect(detectFormat("/x/config.yml")).toBe("yaml");
    expect(detectFormat("a.toml")).toBe("toml");
    expect(detectFormat("a.txt")).toBeUndefined();
  });
});
