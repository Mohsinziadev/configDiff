# Security model

## Goals

- Reports, logs and errors produced by ConfigDiff are safe to publish in CI.
- Configuration is never executed. Policy files are JSON data.
- No network access, telemetry, or temporary files.

## How redaction works

`runComparison` decides sensitivity per leaf while building `Change` objects. A sensitive leaf becomes `{ present: true, type, redacted: true }`; the raw value stays in function-local maps and is discarded. Findings are built from those views and from path names only. As defence in depth, every finding message is scrubbed against the set of known sensitive values (strings of 4+ characters). `ParsedConfig` serializes and inspects as `[values hidden]`.

Sensitivity sources: `sensitive.keys` (globs, any path segment, case-insensitive), `sensitive.patterns` (regex per segment), built-in key patterns (disable with `builtin: false`), value shapes (credential URLs, PEM private keys, JWTs, AWS access key ids, GitHub/Stripe/Slack tokens), and `redactAll`. If any ancestor key of a leaf is sensitive, the leaf is redacted. If either side of a change is sensitive, both are hidden.

## What redaction does not guarantee

- Heuristics miss secrets with innocuous names and unrecognised shapes. Declare them.
- Hidden values still reveal _that_ something changed, its path and its type.
- Paths (keys) are never redacted. Do not put secrets in key names.
- Non-sensitive values are shown verbatim in text and JSON reports.
- Messages from third-party Standard Schema validators are scrubbed best-effort.
- User-authored policy `message` strings are scrubbed but are your responsibility.

## Resource limits

5 MiB input default; nesting depth limit 200 for comparison; YAML alias count limit 100; regex sources from policies limited to 500 characters (no backtracking analysis is performed — policy authors are trusted).

## Parse errors

Only the error code and line/column are reported. Parser messages that quote source (JSON, YAML, TOML) are discarded.

## Tested leak paths

`tests/security/leaks.test.ts` asserts canary secrets never appear in: JSON reports, text reports (all verbosities), `util.inspect`, parse errors for all formats, schema issues (built-in, Zod, async Standard Schema), policy messages, and CLI stdout/stderr (`tests/cli`).
