import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli.js";

const fx = (n: string): string => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "configdiff-"));
const write = (name: string, content: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, content);
  return p;
};

describe("cli", () => {
  it("compare: findings fail with exit 1 and redact secrets", async () => {
    const r = await runCli([
      "compare",
      "--baseline",
      fx("staging.env"),
      "--candidate",
      fx("production.env"),
    ]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("[ERROR] NEXT_PUBLIC_API_SECRET");
    expect(r.stdout).toContain("Sensitive values have been redacted.");
    expect(r.stdout + r.stderr).not.toMatch(/hunter2pass|s3cretprodpw|prod-secret-value/);
  });
  it("--output json is parseable and versioned", async () => {
    const r = await runCli([
      "compare",
      "--baseline",
      fx("staging.env"),
      "--candidate",
      fx("production.env"),
      "--output",
      "json",
      "--fail-on",
      "never",
    ]);
    expect(r.exitCode).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.schemaVersion).toBe(1);
    expect(j.status).toBe("review");
    expect(r.stdout).not.toMatch(/hunter2pass|s3cretprodpw/);
  });
  it("exit 0 when nothing is wrong, with a policy file", async () => {
    const a = write("a.json", '{"x":1}');
    const b = write("b.json", '{"x":2}');
    const pol = write(
      "p.json",
      JSON.stringify({
        rules: { "watch-paths": { paths: [{ path: "x", severity: "warning" }] } },
        failOn: "error",
      }),
    );
    const r = await runCli(["compare", "--baseline", a, "--candidate", b, "--policy", pol]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Result: Review required.");
    const strict = await runCli([
      "compare",
      "--baseline",
      a,
      "--candidate",
      b,
      "--policy",
      pol,
      "--fail-on",
      "warning",
    ]);
    expect(strict.exitCode).toBe(1);
  });
  it("check mode with required keys", async () => {
    const c = write("c.env", "A=1\n");
    const pol = write("p2.json", JSON.stringify({ rules: { "required-keys": { keys: ["B"] } } }));
    const r = await runCli(["check", "--config", c, "--policy", pol, "--quiet"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("Required key is missing.");
  });
  it("--ignore and --sensitive flags", async () => {
    const a = write("i1.json", '{"a":1,"b":"visible-1"}');
    const b = write("i2.json", '{"a":2,"b":"visible-2"}');
    const r = await runCli([
      "compare",
      "--baseline",
      a,
      "--candidate",
      b,
      "--ignore",
      "a",
      "--sensitive",
      "b",
    ]);
    expect(r.stdout).not.toContain("visible-");
    expect(r.stdout).not.toMatch(/~ a /);
  });
  it("usage errors exit 2", async () => {
    for (const args of [
      [],
      ["bogus"],
      ["compare"],
      ["compare", "--baseline", "x"],
      ["compare", "--nope"],
      ["check", "--config", fx("same.json"), "--output", "xml"],
    ]) {
      const r = await runCli(args);
      expect(r.exitCode, args.join(" ")).toBe(2);
      expect(r.stderr).toContain("configdiff:");
    }
  });
  it("input errors exit 2 with useful messages", async () => {
    const missing = await runCli([
      "compare",
      "--baseline",
      join(tmp, "nope.json"),
      "--candidate",
      fx("same.json"),
    ]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain("file not found");
    const dir = await runCli(["check", "--config", tmp]);
    expect(dir.stderr).toContain("Not a regular file");
    const noFormat = await runCli(["check", "--config", write("x.conf", "a")]);
    expect(noFormat.stderr).toContain("--format");
    const bad = await runCli(["check", "--config", write("bad.yaml", "a: [1\n")]);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toMatch(/PARSE_ERROR.*line 2/s);
    const big = await runCli(["check", "--config", fx("same.json"), "--max-size", "5"]);
    expect(big.stderr).toContain("INPUT_TOO_LARGE");
  });
  it("permission errors are reported", async () => {
    if (process.getuid?.() === 0) return;
    const p = write("locked.json", "{}");
    chmodSync(p, 0o000);
    const r = await runCli(["check", "--config", p]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("permission denied");
  });
  it("invalid policy files are rejected without echoing content", async () => {
    const r = await runCli([
      "check",
      "--config",
      fx("same.json"),
      "--policy",
      write("bad.json", '{"rulez": {}, "x": "SUPERSECRETVALUE"'),
    ]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).not.toContain("SUPERSECRETVALUE");
    const typo = await runCli([
      "check",
      "--config",
      fx("same.json"),
      "--policy",
      write("typo.json", '{"rulez": {}}'),
    ]);
    expect(typo.stderr).toContain('Unknown policy key "rulez"');
  });
  it("--help and --version exit 0", async () => {
    expect((await runCli(["--help"])).stdout).toContain("Usage:");
    expect((await runCli(["--version"])).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("formats explicit --format for non-standard names", async () => {
    mkdirSync(join(tmp, "d"), { recursive: true });
    const a = write("d/one.conf", "A=1\n");
    const r = await runCli(["check", "--config", a, "--format", "env"]);
    expect(r.exitCode).toBe(0);
  });
});
