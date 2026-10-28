// Packs the project, installs the tarball into a throwaway project, and exercises the installed artifact.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "configdiff-pack-"));
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(
      `FAIL ${name}\n     ${String(err.stderr ?? err.message)
        .split("\n")
        .slice(0, 6)
        .join("\n     ")}`,
    );
  }
};

try {
  const packOut = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", work], { cwd: root }),
  );
  const tarball = join(work, packOut[0].filename);
  const files = packOut[0].files.map((f) => f.path);
  check("tarball contains only allowlisted files", () => {
    const bad = files.filter(
      (f) => !/^(dist\/|README\.md$|LICENSE$|CHANGELOG\.md$|package\.json$)/.test(f),
    );
    if (bad.length) throw new Error(`unexpected files: ${bad.join(", ")}`);
    for (const need of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/bin.js",
      "README.md",
      "LICENSE",
    ]) {
      if (!files.includes(need)) throw new Error(`missing ${need}`);
    }
    if (files.some((f) => /\.test\.|^src\/|^tests\/|\.env/.test(f)))
      throw new Error("dev files in tarball");
  });

  const app = join(work, "app");
  run("mkdir", ["-p", app]);
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "fixture", private: true, type: "module" }),
  );
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", tarball, join(root, "node_modules/typescript")],
    { cwd: app },
  );

  check("installed runtime dependencies are only yaml and smol-toml", () => {
    const pkg = JSON.parse(
      readFileSync(join(app, "node_modules/configdiff-js/package.json"), "utf8"),
    );
    const deps = Object.keys(pkg.dependencies ?? {})
      .sort()
      .join(",");
    if (deps !== "smol-toml,yaml") throw new Error(deps);
  });

  writeFileSync(
    join(app, "esm.mjs"),
    `
import { compareConfigs, compareEnv, analyzeConfig, parseConfig, VERSION } from "configdiff-js";
const r = compareConfigs({ a: 1 }, { a: 2 });
if (r.changes.length !== 1 || !VERSION) throw new Error("esm broken");
const e = compareEnv("A_SECRET=hunter2hunter2", "A_SECRET=other-other");
if (JSON.stringify(e).includes("hunter2")) throw new Error("leak");
if (analyzeConfig({ candidate: parseConfig("A=1", "env") }).status !== "pass") throw new Error("analyze");
`,
  );
  check("ESM import", () => run("node", ["esm.mjs"], { cwd: app }));

  writeFileSync(
    join(app, "cjs.cjs"),
    `
const { compareConfigs } = require("configdiff-js");
if (compareConfigs({ a: 1 }, { a: 2 }).changes.length !== 1) throw new Error("cjs broken");
`,
  );
  check("CommonJS require() of the ESM build (Node >= 22.12)", () =>
    run("node", ["cjs.cjs"], { cwd: app }),
  );

  check("deep imports are blocked by the export map", () => {
    try {
      run(
        "node",
        ["-e", "import('configdiff-js/dist/cli.js').then(()=>process.exit(1),()=>process.exit(0))"],
        { cwd: app },
      );
    } catch {
      throw new Error("deep import unexpectedly resolved");
    }
  });
  check("package.json export path", () =>
    run(
      "node",
      [
        "-e",
        "import('configdiff-js/package.json',{with:{type:'json'}}).then(m=>{if(!m.default.version)process.exit(1)})",
      ],
      { cwd: app },
    ),
  );

  writeFileSync(
    join(app, "types.ts"),
    `
import { compareConfigs, analyzeConfig, validateConfig, type Report, type Change, ConfigDiffError } from "configdiff-js";
const r: Report = analyzeConfig({ baseline: { a: 1 }, candidate: { a: 2 }, policy: { rules: { "watch-paths": { paths: [{ path: "a" }] } } } });
const c: Change | undefined = r.changes[0];
validateConfig({ A: "1" }, { properties: { A: { type: "integer" } } });
void compareConfigs; void c; void ConfigDiffError;
// @ts-expect-error unknown rule ids are rejected at compile time
analyzeConfig({ candidate: {}, policy: { rules: { "no-such-rule": true } } });
`,
  );
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      files: ["types.ts"],
    }),
  );
  check("TypeScript declarations compile (strict, skipLibCheck off)", () =>
    run(join(app, "node_modules/.bin/tsc"), ["-p", "."], { cwd: app }),
  );

  writeFileSync(
    join(app, "a.env"),
    "API_URL=https://staging.example.com\nDB_PASSWORD=hunter2hunter2\n",
  );
  writeFileSync(
    join(app, "b.env"),
    "API_URL=https://prod.example.com\nDB_PASSWORD=other-secret-pw\n",
  );
  writeFileSync(join(app, "c.env"), "DB_PASSWORD=other-secret-pw\n");
  check("CLI runs from node_modules/.bin, redacts, exits 0", () => {
    const out = run(
      join(app, "node_modules/.bin/configdiff"),
      ["compare", "--baseline", "a.env", "--candidate", "b.env"],
      { cwd: app },
    );
    if (!out.includes("[REDACTED]") || /hunter2|other-secret/.test(out)) throw new Error(out);
  });
  check("CLI exit code 1 on failing findings", () => {
    try {
      run(
        join(app, "node_modules/.bin/configdiff"),
        ["compare", "--baseline", "a.env", "--candidate", "c.env", "--fail-on", "warning"],
        { cwd: app },
      );
      throw new Error("expected exit 1");
    } catch (e) {
      if (e.status !== 1) throw e;
    }
  });
  check("CLI exit code 2 on missing file", () => {
    try {
      run(
        join(app, "node_modules/.bin/configdiff"),
        ["compare", "--baseline", "nope.env", "--candidate", "b.env"],
        { cwd: app },
      );
      throw new Error("expected exit 2");
    } catch (e) {
      if (e.status !== 2) throw e;
    }
  });
  check("CLI survives a closed pipe", () => {
    run(
      "sh",
      [
        "-c",
        `${join(app, "node_modules/.bin/configdiff")} compare --baseline a.env --candidate b.env | head -n 1`,
      ],
      { cwd: app },
    );
  });
  check("examples run against the installed package", () => {
    for (const ex of ["quickstart.mjs"]) {
      writeFileSync(join(app, ex), readFileSync(join(root, "examples", ex), "utf8"));
      run("node", [ex], { cwd: app });
    }
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failures) {
  console.error(`${failures} package check(s) failed`);
  process.exit(1);
}
console.log("package checks passed");
