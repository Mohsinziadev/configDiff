# Product strategy

## Audience

Developers and platform engineers who keep per-environment config (env files plus JSON/YAML/TOML) and review changes in pull requests or deploy pipelines.

## Primary problem

A text diff shows _that_ config changed, not whether the change is risky, and pasting config diffs into CI logs can leak secrets.

## MVP (v0.1)

- Parse env, JSON, YAML, TOML (no code execution).
- Structural comparison with explicit array semantics and opt-in normalization.
- 15 documented rules (see RULES.md), per-path severities, built-in schema subset and Standard Schema adapter.
- Redaction built into the result model; text and JSON reports; exit codes 0/1/2.
- Not in MVP: JS/TS config, JSON Schema, source scanning, live infrastructure, plugins/custom code rules, auto-fix.

## Differentiation hypothesis

Teams that compare _nested_ config across environments will prefer one offline tool with explainable rules and safe output over ad-hoc `diff` + `jq` + scripts. The defensible core is the combination; individual pieces (key diffing, validation) are already well served.

## Evidence that would invalidate the idea

- Users of dotenv-diff/dotenvx report they need nothing beyond `.env` key/value checks, and no one wants nested-format policy.
- Real configs produce so many false positives that rules get disabled wholesale.
- Teams prefer enforcing policy inside their app's validator (Zod/T3 Env) rather than in CI.
- Nobody uses the redacted JSON report in CI.

None of this has been tested with real users yet.
