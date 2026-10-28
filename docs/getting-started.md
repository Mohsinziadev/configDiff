# Getting Started

ConfigDiff compares configuration _structurally_ (env, JSON, YAML, TOML), explains what changed, flags risky changes with documented rules, and keeps secrets out of every report. It runs offline: no account, no telemetry, no network access, and it never executes your config.

## Install

```bash
npm install --save-dev configdiff-js
npx configdiff-js --help
```

Requires Node.js 22.12 or newer. The package is ESM; `require("configdiff-js")` also works on Node 22.12+. Runtime dependencies are `yaml` and `smol-toml`.

## Compare two environments

```bash
npx configdiff-js compare \
  --baseline .env.staging \
  --candidate .env.production \
  --policy configdiff.policy.json
```

Output is plain text with severities spelled out, so it is safe to paste into a pull request or CI log:

```text
[ERROR] ENABLE_AUTH  (watch-paths)
  Authentication must stay enabled. Value changed from "true" to "false".
[WARNING] API_URL  (environment-mismatch)
  Candidate value contains the marker "staging" (value not shown).
[ERROR] NEXT_PUBLIC_API_SECRET  (public-secret-exposure)
  "NEXT_PUBLIC_" variables are exposed to client code, but this one looks secret.
```

Formats are detected from the file name (`.env`, `.env.*`, `*.env`, `.json`, `.yaml`/`.yml`, `.toml`), or set with `--format`.

## Check a single config

```bash
npx configdiff-js check --config config/production.yaml --policy configdiff.policy.json
```

Rules that need a baseline are skipped in `check` mode.

## Use the API

```js
import { analyzeConfig, parseConfig } from "configdiff-js";

const report = analyzeConfig({
  baseline: parseConfig(stagingText, "env"),
  candidate: parseConfig(productionText, "env"),
  policy: { rules: { "environment-mismatch": { baseline: "staging" } } },
});

console.log(report.status); // "pass" | "review" | "fail"
console.log(JSON.stringify(report, null, 2)); // safe to publish: sensitive values are not in it
```

`compareConfigs` returns changes only, `analyzeConfig` adds findings, and `validateConfig` checks one config against a schema. See the [API reference](api-design.md).

## Exit codes

| Code | Meaning                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 0    | No finding at or above `--fail-on` (default `error`). Findings below it are listed as "Review required". |
| 1    | At least one finding at or above `--fail-on`.                                                            |
| 2    | Usage error, unreadable or oversized file, parse error, invalid policy.                                  |

## Next steps

- Learn [how comparison works](concepts.md).
- Write a [policy file](policy.md) for your environments.
- Run it in [CI](ci.md).
