# Core Concepts

## Structural comparison

ConfigDiff parses both sides into a tree, flattens it to paths (`db.pool[0].host`), and compares leaves. Key order, whitespace, comments and formatting never appear as changes. A text diff cannot tell you that key order changed but nothing else did, that an array was reordered, or that `3000` became `"3000"`. ConfigDiff can.

## Changes and findings

A **change** is a fact: a path was added, removed or modified. A **finding** is a judgement: a rule decided a change (or the config itself) is risky. Every finding carries a `ruleId`, a `severity` (`info`, `warning`, `error`), the `path`, a `message` and a `remediation`.

The report `status` is `fail` if any finding is at or above `failOn` (default `error`), `review` if there are findings below it, and `pass` otherwise.

## Semantics worth knowing

- **Absent is not empty is not null.** `A=` is present with `""`; a missing key is absent; JSON `null` is its own value.
- **No guessing types.** Env values are strings and compared as strings. Use `coerce` (compare) or a schema (validate) to type them, with a documented grammar: integer `-?\d+`, number decimal or exponent, boolean exactly `true` or `false`.
- **Arrays are ordered by default** (`l[0]`, `l[1]`). Declare `unordered: ["regions"]` to compare them as multisets.
- **Normalization is opt-in**, except CRLF to LF in strings (`normalizeNewlines: false` turns that off). `trim`, `coerce`, `ignore` and `unordered` take path globs: `*`, `**`, `[*]`.
- **Deterministic output.** Sorted by path, no timestamps, so identical inputs give identical bytes.

## Supported formats

| Format | Parser               | Notes                                                                                                                                                                                |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| env    | built-in             | `KEY=value`, `export`, comments, quotes (multi-line), `\n \r \t \" \\` escapes in double quotes. **No `${VAR}` interpolation.** Duplicate keys reported. Malformed lines are errors. |
| JSON   | `JSON.parse`         | Duplicate keys are silently collapsed by JSON itself.                                                                                                                                |
| YAML   | `yaml` (core schema) | Duplicate keys are errors; alias expansion is limited.                                                                                                                               |
| TOML   | `smol-toml`          | Datetimes become ISO strings; huge integers become strings.                                                                                                                          |

JS and TS config files are **not** supported, because evaluating them means running code. Export to JSON first if you trust the file. Inputs over 5 MiB are rejected (`--max-size` in the CLI).

## Drift

"Drift" here means comparing two snapshots you provide: staging vs production, a template vs a local file, a generated file vs an approved baseline. ConfigDiff does not inspect live infrastructure, and snapshots taken at different times can differ for reasons unrelated to drift.
