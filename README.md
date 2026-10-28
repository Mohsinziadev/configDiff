# ConfigDiff

**Find configuration problems before they become production incidents.**

ConfigDiff compares configuration _structurally_ (env, JSON, YAML, TOML), explains what changed, flags risky changes with explicit, documented rules, and keeps secrets out of every report. It runs offline: no account, no telemetry, no network access, and it never executes your config.

```text
[ERROR] ENABLE_AUTH  (watch-paths)
  Authentication must stay enabled. Value changed from "true" to "false".
[WARNING] API_URL  (environment-mismatch)
  Candidate value contains the marker "staging" (value not shown).
[ERROR] NEXT_PUBLIC_API_SECRET  (public-secret-exposure)
  "NEXT_PUBLIC_" variables are exposed to client code, but this one looks secret.
```

## Why not just `diff`?

A text diff cannot tell you that key order changed but nothing else did, that an array was reordered, that `3000` became `"3000"`, which change matters, or whether pasting the diff into CI logs leaks a password. See [Comparison with alternatives](#comparison-with-alternatives) for where other tools are the better choice.

## Install

```bash
npm install --save-dev configdiff     # requires Node.js >= 22.12
npx configdiff --help
```

ESM package; `require("configdiff")` also works on Node >= 22.12. Runtime dependencies: `yaml`, `smol-toml`.

## CLI

```bash
# Compare two environments
npx configdiff compare --baseline .env.staging --candidate .env.production \
  --baseline-name staging --candidate-name production --policy configdiff.policy.json

# Check a single config against a policy/schema (no baseline)
npx configdiff check --config config/production.yaml --policy configdiff.policy.json

# Machine-readable, CI-friendly
npx configdiff compare --baseline a.json --candidate b.json --output json --fail-on warning
```

Formats are detected from the file name (`.env`, `.env.*`, `*.env`, `.json`, `.yaml`/`.yml`, `.toml`) or set with `--format`. Run `configdiff --help` for all flags.

Try it with the bundled example (output above is real):

```bash
npx configdiff compare --baseline examples/staging.env --candidate examples/production.env \
  --policy examples/configdiff.policy.json
```

### Exit codes

| Code | Meaning                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 0    | No finding at or above `--fail-on` (default `error`). Findings below it are listed as "Review required". |
| 1    | At least one finding at or above `--fail-on`.                                                            |
| 2    | Usage error, unreadable/oversized file, parse error, invalid policy.                                     |

## API

```js
import { compareConfigs, compareEnv, analyzeConfig, validateConfig, parseConfig } from "configdiff";

const { changes } = compareConfigs(
  { API_URL: "https://staging.example.com", PORT: 3000, ENABLE_AUTH: true },
  { API_URL: "https://production.example.com", PORT: 3000, ENABLE_AUTH: false },
);

const report = analyzeConfig({
  baseline: parseConfig(stagingText, "env"),
  candidate: parseConfig(productionText, "env"),
  policy: { rules: { "environment-mismatch": { baseline: "staging" } } },
});
console.log(JSON.stringify(report, null, 2)); // safe to publish: sensitive values are not in it
```

`examples/quickstart.mjs` is executed against the packed package in `npm run test:package`. Full design: [docs/API-DESIGN.md](docs/API-DESIGN.md).

Key semantics:

- **Absent ≠ empty ≠ null.** `A=` is present with `""`; a missing key is absent.
- **No guessing types.** Env values are strings and compared as strings. Use `coerce` (compare) or a schema (validate) with a documented grammar: integer `-?\d+`, number decimal/exponent, boolean exactly `true`/`false`.
- **Arrays are ordered by default** (`l[0]`, `l[1]`). Declare `unordered: ["regions"]` to compare as multisets.
- **Normalization is opt-in** except CRLF→LF in strings (`normalizeNewlines: false` to disable). `trim`, `coerce`, `ignore`, `unordered` take path globs (`*`, `**`, `[*]`).
- **Deterministic output**: sorted by path, no timestamps.

## Supported formats

| Format | Parser               | Notes                                                                                                                                                                                |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| env    | built-in             | `KEY=value`, `export`, comments, quotes (multi-line), `\n \r \t \" \\` escapes in double quotes. **No `${VAR}` interpolation.** Duplicate keys reported. Malformed lines are errors. |
| JSON   | `JSON.parse`         | Duplicate keys are silently collapsed by JSON itself.                                                                                                                                |
| YAML   | `yaml` (core schema) | Duplicate keys are errors; alias expansion is limited.                                                                                                                               |
| TOML   | `smol-toml`          | Datetimes become ISO strings; huge integers become strings.                                                                                                                          |

JS/TS config files are **not** supported: evaluating them means running code. Export to JSON first (`node -e 'console.log(JSON.stringify(require("./config.js")))'`) if you trust the file. Inputs over 5 MiB are rejected (`--max-size` in the CLI).

## Rules

15 rules, each with a stable id, severity, remediation text and documented false-positive limits: [docs/RULES.md](docs/RULES.md). Defaults are deliberately conservative: only structural facts (missing key, type change, empty value, possible rename), `public-secret-exposure`, `credential-in-url`, `duplicate-keys` and `coercion-failed` run unless you configure more. Policy files are plain JSON (no code execution); unknown keys are rejected so typos fail loudly.

## Secret redaction

Redaction happens when changes are built, not when output is printed. Public objects (`Change`, `Finding`, `Report`) hold `{ redacted: true }` instead of the value, so text, JSON, `util.inspect` and error paths cannot leak what they never received. There is **no flag to reveal values**.

A value is redacted if its key path matches your `sensitive.keys` (globs, case-insensitive), your `sensitive.patterns`, or conservative built-ins (`secret`, `password`, `token`, `api_key`, `private_key`, `credential`, `*_KEY`, `dsn`, ...), or if the value _looks like_ a credential (URL with `user:pass@`, PEM private key, JWT, AWS key id, GitHub/Stripe/Slack token shapes). Use `sensitive.redactAll` to hide everything.

**Limits:** this is heuristic. A secret with an innocuous name and no recognizable shape is not caught — declare it in `sensitive.keys`. Names like `AUTH` or `KEY` alone are not flagged. See [docs/SECURITY.md](docs/SECURITY.md).

## Schema validation

```js
validateConfig(parseConfig(text, "env"), {
  properties: { PORT: { type: "integer", min: 1, max: 65535, required: true } },
  unknownKeys: "warn",
});
```

Pass a built-in schema or any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType). Third-party messages are scrubbed of known sensitive values and replaced entirely for sensitive keys. Async validators need `validateConfigAsync`. JSON Schema is not supported yet.

## CI/CD

```yaml
# .github/workflows/config.yml
name: config
on: pull_request
jobs:
  configdiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx --yes configdiff@0.1 compare --baseline config/staging.yaml --candidate config/production.yaml --policy configdiff.policy.json --fail-on warning
```

Output is plain text with severities spelled out (no colour), and is safe for CI logs.

## Errors

All thrown errors are `ConfigDiffError` with a `code` (`PARSE_ERROR`, `INVALID_POLICY`, `INPUT_TOO_LARGE`, `FILE_ERROR`, `ASYNC_VALIDATOR`, ...). Parse errors give line/column, never source text.

## Drift

"Drift" here means comparing two snapshots you provide (staging vs production, a template vs a local file, a generated file vs an approved baseline). ConfigDiff does not inspect live infrastructure, and snapshots taken at different times can differ for reasons unrelated to drift.

## Performance

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md). In short: raw diff libraries are 10–100× faster on the same inputs because ConfigDiff also normalizes, redacts and builds a report model. 100k leaves take about 0.3 s. Speed is not a selling point; do not choose ConfigDiff for it.

## Comparison with alternatives

| Need                                                                           | Better choice                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Runtime validation of `process.env` with types                                 | envalid, T3 Env, env-schema                              |
| `.env` vs `.env.example`, unused/missing variables found by scanning your code | [dotenv-diff](https://www.npmjs.com/package/dotenv-diff) |
| Encrypting env files                                                           | dotenvx                                                  |
| Raw object diff in a library                                                   | microdiff, deep-diff                                     |
| Nested JSON/YAML/TOML across environments + policy + safe reports              | **ConfigDiff**                                           |

Details and sources: [docs/MARKET-RESEARCH.md](docs/MARKET-RESEARCH.md).

## Troubleshooting

- _"Cannot detect the format"_ → pass `--format`.
- _Everything shows as changed in arrays_ → arrays are index-ordered; use `unordered`.
- _`3000` vs `"3000"` reported_ → declare `coerce`.
- _Too many/few values redacted_ → tune `sensitive.keys`, `sensitive.patterns`, `sensitive.builtin`.
- _Policy rejected_ → unknown keys and unknown rule ids are errors by design.

## Contributing, license, changelog

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md) · MIT, see [LICENSE](LICENSE).
