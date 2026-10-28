# Rules

Generated from the rule registry by `npm run docs:rules`. Do not edit the per-rule sections by hand.

Every finding carries `ruleId`, `severity`, `path`, `message` and `remediation`. Messages never contain sensitive values.
Disable a rule with `"rules": { "<id>": false }`; override severity with `"rules": { "<id>": { "severity": "info" } }`.
Rules marked _needs baseline_ are skipped by `configdiff check` / `analyzeConfig` without a baseline.

| Rule                                                  | Default             | Severity | Needs baseline |
| ----------------------------------------------------- | ------------------- | -------- | -------------- |
| [`missing-in-candidate`](#missing-in-candidate)       | on                  | warning  | yes            |
| [`type-mismatch`](#type-mismatch)                     | on                  | warning  | yes            |
| [`empty-value`](#empty-value)                         | on                  | warning  | yes            |
| [`required-keys`](#required-keys)                     | off (needs options) | error    | no             |
| [`forbidden-values`](#forbidden-values)               | off (needs options) | error    | no             |
| [`environment-mismatch`](#environment-mismatch)       | off (needs options) | warning  | no             |
| [`sensitive-value-changes`](#sensitive-value-changes) | off                 | info     | yes            |
| [`sensitive-value-shared`](#sensitive-value-shared)   | off                 | warning  | yes            |
| [`public-secret-exposure`](#public-secret-exposure)   | on                  | error    | no             |
| [`duplicate-keys`](#duplicate-keys)                   | on                  | warning  | no             |
| [`possible-rename`](#possible-rename)                 | on                  | info     | yes            |
| [`watch-paths`](#watch-paths)                         | off (needs options) | warning  | yes            |
| [`coercion-failed`](#coercion-failed)                 | on                  | warning  | no             |
| [`schema-violation`](#schema-violation)               | on                  | error    | no             |
| [`credential-in-url`](#credential-in-url)             | on                  | warning  | no             |

## missing-in-candidate

A key present in the baseline is absent from the candidate.

- **Default:** enabled, severity `warning`
- **Remediation:** Add the key to the candidate, or remove it from the baseline if it is obsolete.
- **False positives / limitations:** Cannot tell an intentional removal from an accidental one. Renamed keys also appear here (see possible-rename).

## type-mismatch

A value has a different type in the candidate (for example number vs string).

- **Default:** enabled, severity `warning`
- **Remediation:** Confirm the new type is intended, or declare coercion/schema types for the path.
- **False positives / limitations:** Env files are all strings, so env-to-env comparisons never produce type changes without coerce.

## empty-value

A string that had content in the baseline is empty in the candidate.

- **Default:** enabled, severity `warning`
- **Remediation:** Set a value, or remove the key if it is meant to be unset.
- **False positives / limitations:** Some keys are legitimately empty in some environments.

## required-keys

A key listed in the policy is missing or empty in the candidate.

- **Default:** disabled, severity `error`
- **Remediation:** Define the key with a non-empty value, or remove it from the required list.
- **False positives / limitations:** Only checks presence/emptiness, not whether the value is valid. Use a schema for that.

## forbidden-values

A value equals a forbidden value or matches a forbidden pattern for its path.

- **Default:** disabled, severity `error`
- **Remediation:** Change the value to one the policy allows.
- **False positives / limitations:** Patterns are regular expressions supplied by the policy author; ConfigDiff does not check them for catastrophic backtracking beyond a 500-character limit.

## environment-mismatch

A candidate string contains a marker naming another environment (for example `staging` in a production value).

- **Default:** disabled, severity `warning`
- **Remediation:** Verify the value belongs to the candidate environment.
- **False positives / limitations:** Word-boundary text match only. `staging` inside a legitimate hostname or comment triggers it; use markers specific to your naming.

## sensitive-value-changes

A value classified as sensitive changed. Values are never shown.

- **Default:** disabled, severity `info`
- **Remediation:** Confirm the rotation or change was intended.
- **False positives / limitations:** Sensitivity is heuristic (key names, value shapes, your declarations). Expected to fire often between environments.

## sensitive-value-shared

The same sensitive value appears in both baseline and candidate.

- **Default:** disabled, severity `warning`
- **Remediation:** Use a distinct secret per environment.
- **False positives / limitations:** Only meaningful when baseline and candidate are different environments. Sensitivity is heuristic.

## public-secret-exposure

A key with a client-exposed prefix (such as NEXT_PUBLIC_) has a secret-like name or value.

- **Default:** enabled, severity `error`
- **Remediation:** Move the value to a server-only variable and expose only a public identifier to the client.
- **False positives / limitations:** Name/shape based. Names such as *_TOKEN or *_KEY are not flagged because many public identifiers use them; secrets with innocuous names are missed.

## duplicate-keys

An env file defines the same key more than once; the last definition wins.

- **Default:** enabled, severity `warning`
- **Remediation:** Remove the earlier definitions.
- **False positives / limitations:** Env files only. JSON silently keeps the last duplicate and YAML rejects duplicates as a parse error; TOML rejects them too.

## possible-rename

A removed key and an added key share an identical string value of 6+ characters.

- **Default:** enabled, severity `info`
- **Remediation:** If this is a rename, update consumers of the old key.
- **False positives / limitations:** Evidence is value equality only, and only when the value is unique on both sides. Renames that also change the value are not detected.

## watch-paths

A path you asked to watch changed.

- **Default:** disabled, severity `warning`
- **Remediation:** Review the change against the intent recorded in the policy message.
- **False positives / limitations:** Fires on any change to the matching path, including harmless ones.

## coercion-failed

A value could not be coerced to the type declared in `coerce`; it was compared unmodified.

- **Default:** enabled, severity `warning`
- **Remediation:** Fix the value or the coerce declaration.
- **False positives / limitations:** Accepted grammar is strict: integer `-?\d+`, number decimal/exponent, boolean exactly `true`/`false`.

## schema-violation

The candidate violates the supplied schema.

- **Default:** enabled, severity `error`
- **Remediation:** Fix the value or update the schema.
- **False positives / limitations:** Runs only when a schema is supplied. Standard Schema issue messages from third-party validators are scrubbed of known sensitive values, but cannot be audited in general.

## credential-in-url

A candidate string contains a URL with embedded `user:password@` credentials.

- **Default:** enabled, severity `warning`
- **Remediation:** Provide credentials through a separate secret variable or secret manager where the consumer supports it.
- **False positives / limitations:** Many connection strings legitimately embed credentials. Disable the rule if that is your convention.

## Option reference

```jsonc
"required-keys":          { "keys": ["DATABASE_URL", "API_*"], "allowEmpty": false }
"forbidden-values":       { "items": [{ "path": "DEBUG", "equals": ["true", true] }, { "path": "*_URL", "pattern": "localhost", "message": "No localhost in production." }] }
"environment-mismatch":   { "baseline": "staging" }            // or "markers": ["staging", "dev"]
"public-secret-exposure": { "publicPrefixes": ["NEXT_PUBLIC_"] }
"watch-paths":            { "paths": [{ "path": "feature.*", "severity": "warning", "message": "Review flag changes." }] }
```

## Path globs

`*` matches within one segment, `**` across segments, `[*]` any array index. Paths look like `a.b[0].c`. Env keys are a single segment.

## Grammar for coercion and schema checks on env strings

| Type    | Accepted                               |
| ------- | -------------------------------------- |
| integer | `-?\d+` (safe integer range)           |
| number  | decimal with optional exponent, finite |
| boolean | exactly `true` or `false`              |

Nothing else is coerced. Without `coerce` or a schema, env values are plain strings.

## Built-in schema

```ts
{ type?, required?, enum?, min?, max?, minLength?, maxLength?, pattern?, properties?, items?, unknownKeys?: "allow" | "warn" | "error" }
```

`type` is one of string, number, integer, boolean, null, array, object (or a list). Any [Standard Schema](https://standardschema.dev) validator (Zod 3.24+/4, Valibot, ArkType) can be passed instead.
JSON Schema is not supported in 0.1.
