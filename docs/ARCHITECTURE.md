# Architecture

```
text ──parsers──▶ ParsedConfig ─┐
objects ────────────────────────┤
                                ▼
                  normalize (flatten to leaf map: ignore, trim, coerce, newlines, unordered arrays)
                                ▼
                  compare (leaf maps → Entry{ Change(public, redacted), raw leaves(private) })
                                ▼
                  rules (+ schema)  → Finding[]  (messages from views/paths only, then scrubbed)
                                ▼
                  Report (JSON-safe)  ──▶ formatText / JSON.stringify
```

| Module              | Responsibility                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `parsers/`          | env (own, small), JSON, YAML (`yaml`), TOML (`smol-toml`). Error → code + location only.     |
| `normalize.ts`      | Flatten to path→leaf; opt-in normalization; no mutation of inputs.                           |
| `redact.ts`         | `Redactor` (key/value sensitivity) and `Scrubber` (defence in depth).                        |
| `compare.ts`        | Diff of leaf maps; builds public `Change`s; raw values stay in private `Entry`s.             |
| `rules.ts`          | Rule registry (metadata + implementation). `RuleId` is a closed union.                       |
| `schema.ts`         | Built-in schema subset; Standard Schema adapter lives in `analyze.ts`.                       |
| `analyze.ts`        | Public API wiring; report assembly and status.                                               |
| `cli.ts` / `bin.ts` | Argument parsing (`node:util`), file reading/limits, exit codes. `runCli` is pure for tests. |

Decisions: the core has no filesystem access; leaf-map comparison (rather than a recursive diff) lets normalization, redaction and rules share one representation; empty containers are leaves, and an empty container that gains children is described by the children only; ESM only (CommonJS consumers use `require()` of ESM on Node ≥ 22.12); no custom-code rules (policies are data).
