# API design

## Functions

```ts
parseConfig(text: string, format: "env"|"json"|"yaml"|"toml"): ParsedConfig
compareConfigs(baseline, candidate, options?: CompareOptions): ComparisonResult   // changes only
compareEnv(baseline: string | Record<string,string>, candidate: ..., options?): ComparisonResult
analyzeConfig({ baseline, candidate?, policy? }): Report                          // changes + findings
validateConfig(config, schema, options?): Report                                  // findings only
validateConfigAsync(config, schema, options?): Promise<Report>                    // async Standard Schema validators
```

Inputs may be plain values or `ParsedConfig` (carries env duplicate-key info and the source format).
The core never touches the filesystem; file reading lives in the CLI layer.

## Concepts

- **Path**: `string | number` segments. String form: `a.b[0].c`. Env keys are a single segment even if they contain dots.
- **Presence**: every side of a change has `present: boolean`. Absent ≠ `""` ≠ `null`.
- **Types**: `string | number | boolean | null | array | object`; arrays/objects appear as leaves only when empty or when compared as unordered sets.
- **No implicit coercion**: env values are strings. They are compared as strings. Typing happens only via `coerce` (compare) or a schema (validate), using the grammar in SECURITY.md/RULES.md.
- **Arrays**: ordered, by index (`a[0]`), unless the path matches `unordered`; unordered arrays compare as multisets and report one `modified` change at the array path.
- **Ordering**: changes and findings are sorted by path (numeric-aware), then rule id. Output has no timestamps, so identical inputs give identical bytes.
- **Redaction**: decided at comparison time. Public objects (`Change`, `Finding`, `Report`) carry `{ redacted: true }` instead of the value. There is no option to reveal values. Redaction applies to every output format because the values never reach them.
- **Errors**: `ConfigDiffError` with a stable `code` (`PARSE_ERROR`, `INVALID_OPTIONS`, `INVALID_POLICY`, `INPUT_TOO_LARGE`, `FILE_ERROR`, `UNSUPPORTED_FORMAT`, `SCHEMA_ERROR`, `ASYNC_VALIDATOR`). Messages never contain config values; parse errors carry line/column only.
- **Result status**: `fail` if any finding is at or above `failOn` (default `error`), `review` if there are findings below it, otherwise `pass`.
- **Exit codes (CLI)**: `0` pass or review; `1` fail; `2` usage/input error.
- **Compatibility**: semver. Report `schemaVersion` changes only on breaking report-shape changes. Rule ids are stable; removing one is a major version.
