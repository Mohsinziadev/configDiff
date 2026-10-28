# Policy

A policy is a plain JSON file. It is data, never code: nothing in it is executed. Unknown keys and unknown rule ids are **errors**, so typos fail loudly instead of silently disabling a check.

```json
{
  "version": 1,
  "baselineName": "staging",
  "candidateName": "production",
  "failOn": "error",
  "coerce": { "PORT": "integer" },
  "sensitive": { "keys": ["DATABASE_URL"] },
  "rules": {
    "environment-mismatch": { "baseline": "staging" },
    "required-keys": { "keys": ["DATABASE_URL", "REDIS_URL"] },
    "watch-paths": {
      "paths": [
        {
          "path": "ENABLE_AUTH",
          "severity": "error",
          "message": "Authentication must stay enabled."
        }
      ]
    }
  }
}
```

## Top-level keys

| Key                             | Meaning                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `version`                       | Must be `1`.                                                                |
| `baselineName`, `candidateName` | Labels shown in reports.                                                    |
| `failOn`                        | `info`, `warning`, `error` or `never`.                                      |
| `ignore`                        | Path globs excluded from comparison.                                        |
| `unordered`                     | Path globs whose arrays compare as multisets.                               |
| `trim`                          | Path globs whose strings are trimmed before comparison.                     |
| `coerce`                        | Path glob to `string`, `number`, `integer` or `boolean`.                    |
| `normalizeNewlines`             | Convert CRLF and CR to LF. Default `true`.                                  |
| `sensitive`                     | `keys`, `patterns`, `builtin` and `redactAll`. See [Security](security.md). |
| `schema`                        | A built-in schema. See [Schema validation](schema-validation.md).           |
| `rules`                         | Per-rule configuration.                                                     |

## Configuring rules

Disable a rule with `"rules": { "<id>": false }`. Override its severity with `"rules": { "<id>": { "severity": "info" } }`. Rules that need options, such as `required-keys` and `watch-paths`, stay off until you give them. Every rule is described in [Rules](rules.md).
