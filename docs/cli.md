# CLI

```bash
configdiff compare --baseline <file> --candidate <file> [options]
configdiff check   --config <file> [options]
```

## Options

| Flag                      | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `--baseline <file>`       | Baseline config (compare).                                      |
| `--candidate <file>`      | Candidate config (compare).                                     |
| `--config <file>`         | Config to check (check).                                        |
| `--format <fmt>`          | `env`, `json`, `yaml` or `toml`. Default: detect from the name. |
| `--policy <file>`         | Policy file (JSON). See [Policy](policy.md).                    |
| `--output <text\|json>`   | Output format. Default: `text`.                                 |
| `--fail-on <level>`       | `error`, `warning`, `info` or `never`. Default: `error`.        |
| `--ignore <glob>`         | Ignore a path. Repeatable.                                      |
| `--sensitive <key>`       | Treat a key as sensitive. Repeatable.                           |
| `--baseline-name <name>`  | Label for the baseline.                                         |
| `--candidate-name <name>` | Label for the candidate.                                        |
| `--quiet`                 | Summary and findings only.                                      |
| `--verbose`               | Do not truncate values.                                         |
| `--max-size <bytes>`      | Input size limit. Default: 5242880.                             |

## Examples

```bash
# Machine-readable, CI-friendly
npx configdiff compare --baseline a.json --candidate b.json --output json --fail-on warning

# Ignore noisy paths and force a key to be redacted
npx configdiff compare --baseline a.yaml --candidate b.yaml --ignore "metadata.**" --sensitive internal_token
```

## Exit codes

`0` pass or review, `1` findings at or above `--fail-on`, `2` usage or input error.

Sensitive values are always redacted. There is no option to reveal them.
