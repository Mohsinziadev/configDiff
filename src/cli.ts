import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { analyzeConfig } from "./analyze.js";
import { ConfigDiffError } from "./errors.js";
import { formatText } from "./format.js";
import { detectFormat, MAX_INPUT_BYTES, parseConfig } from "./parsers/index.js";
import { validatePolicy } from "./policy.js";
import type { ConfigFormat, FailOn, Policy } from "./types.js";
import { VERSION } from "./version.js";

const HELP = `configdiff ${VERSION} — structural config comparison with risk-aware findings

Usage:
  configdiff compare --baseline <file> --candidate <file> [options]
  configdiff check   --config <file> [options]

Options:
  --baseline <file>         Baseline config (compare)
  --candidate <file>        Candidate config (compare)
  --config <file>           Config to check (check)
  --format <fmt>            env | json | yaml | toml (default: detect from file name)
  --policy <file>           Policy file (JSON), see docs/RULES.md
  --output <text|json>      Output format (default: text)
  --fail-on <level>         error | warning | info | never (default: error)
  --ignore <glob>           Ignore a path (repeatable)
  --sensitive <key>         Treat a key as sensitive (repeatable)
  --baseline-name <name>    Label for the baseline
  --candidate-name <name>   Label for the candidate
  --quiet                   Summary and findings only
  --verbose                 Do not truncate values
  --max-size <bytes>        Input size limit (default ${MAX_INPUT_BYTES})
  -h, --help                Show this help
  -v, --version             Show version

Exit codes: 0 pass or review, 1 findings at/above --fail-on, 2 usage or input error.
Sensitive values are always redacted; there is no option to reveal them.
`;

class UsageError extends Error {}

async function readSource(path: string, maxSize: number): Promise<string> {
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new ConfigDiffError("FILE_ERROR", `Not a regular file: ${path}`);
    if (s.size > maxSize)
      throw new ConfigDiffError("INPUT_TOO_LARGE", `File exceeds ${maxSize} bytes: ${path}`);
    return await readFile(path, "utf8");
  } catch (err) {
    if (err instanceof ConfigDiffError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    const why =
      code === "ENOENT"
        ? "file not found"
        : code === "EACCES"
          ? "permission denied"
          : `cannot read (${code ?? "unknown"})`;
    throw new ConfigDiffError("FILE_ERROR", `${path}: ${why}`);
  }
}

function pickFormat(path: string, explicit: string | undefined): ConfigFormat {
  const f = explicit ?? detectFormat(path);
  if (f === "env" || f === "json" || f === "yaml" || f === "toml") return f;
  throw new UsageError(
    explicit
      ? `Unsupported --format "${explicit}" (use env, json, yaml or toml)`
      : `Cannot detect the format of "${path}". Pass --format env|json|yaml|toml`,
  );
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run the CLI without touching process state. Used by bin.ts and by tests. */
export async function runCli(argv: string[]): Promise<CliResult> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        baseline: { type: "string" },
        candidate: { type: "string" },
        config: { type: "string" },
        format: { type: "string" },
        policy: { type: "string" },
        output: { type: "string" },
        "fail-on": { type: "string" },
        ignore: { type: "string", multiple: true },
        sensitive: { type: "string", multiple: true },
        "baseline-name": { type: "string" },
        "candidate-name": { type: "string" },
        "max-size": { type: "string" },
        quiet: { type: "boolean" },
        verbose: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    }));
  } catch (err) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `configdiff: ${(err as Error).message}\nRun "configdiff --help" for usage.\n`,
    };
  }
  if (values.help || positionals[0] === "help") return { exitCode: 0, stdout: HELP, stderr: "" };
  if (values.version) return { exitCode: 0, stdout: `${VERSION}\n`, stderr: "" };

  try {
    const command = positionals[0];
    if (command !== "compare" && command !== "check") {
      throw new UsageError(
        command ? `Unknown command "${command}"` : "Missing command (compare or check)",
      );
    }
    if (positionals.length > 1) throw new UsageError(`Unexpected argument "${positionals[1]}"`);
    const output = values.output ?? "text";
    if (output !== "text" && output !== "json")
      throw new UsageError('--output must be "text" or "json"');
    const maxSize = values["max-size"] === undefined ? MAX_INPUT_BYTES : Number(values["max-size"]);
    if (!Number.isInteger(maxSize) || maxSize <= 0)
      throw new UsageError("--max-size must be a positive integer");
    const failOn = values["fail-on"];
    if (failOn !== undefined && !["error", "warning", "info", "never"].includes(failOn)) {
      throw new UsageError("--fail-on must be error, warning, info or never");
    }

    let policy: Policy = {};
    if (values.policy) {
      const text = await readSource(values.policy, maxSize);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ConfigDiffError(
          "INVALID_POLICY",
          `Policy file is not valid JSON: ${values.policy}`,
        );
      }
      policy = validatePolicy(raw);
    }
    policy = {
      ...policy,
      ...(failOn ? { failOn: failOn as FailOn } : {}),
      ...(values["baseline-name"] ? { baselineName: values["baseline-name"] } : {}),
      ...(values["candidate-name"] ? { candidateName: values["candidate-name"] } : {}),
      ...(values.ignore ? { ignore: [...(policy.ignore ?? []), ...values.ignore] } : {}),
      ...(values.sensitive
        ? {
            sensitive: {
              ...policy.sensitive,
              keys: [...(policy.sensitive?.keys ?? []), ...values.sensitive],
            },
          }
        : {}),
    };

    const load = async (path: string | undefined, flag: string) => {
      if (!path) throw new UsageError(`Missing ${flag}`);
      return parseConfig(await readSource(path, maxSize), pickFormat(path, values.format));
    };
    const report =
      command === "compare"
        ? analyzeConfig({
            baseline: await load(values.baseline, "--baseline"),
            candidate: await load(values.candidate, "--candidate"),
            policy,
          })
        : analyzeConfig({ candidate: await load(values.config, "--config"), policy });

    const stdout =
      output === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatText(report, { quiet: values.quiet === true, verbose: values.verbose === true });
    return { exitCode: report.status === "fail" ? 1 : 0, stdout, stderr: "" };
  } catch (err) {
    if (err instanceof UsageError) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: `configdiff: ${err.message}\nRun "configdiff --help" for usage.\n`,
      };
    }
    if (err instanceof ConfigDiffError) {
      const loc = err.location
        ? ` (line ${err.location.line}${err.location.column ? `, column ${err.location.column}` : ""})`
        : "";
      return { exitCode: 2, stdout: "", stderr: `configdiff: ${err.code}: ${err.message}${loc}\n` };
    }
    // Unknown errors: report the class only, never a message that might quote config.
    return {
      exitCode: 2,
      stdout: "",
      stderr: `configdiff: unexpected internal error (${(err as Error).name})\n`,
    };
  }
}
