# Limitations

What ConfigDiff deliberately does not do:

- **It does not execute config.** JS and TS config files are not supported. There are no code rules in policies.
- **It does not read live infrastructure.** It compares two snapshots you provide.
- **No `${VAR}` interpolation** in env files. Values are compared as written.
- **No type guessing.** Env values are strings until you `coerce` them.
- **Redaction is heuristic.** A secret with an innocuous name and no recognizable shape is not caught; declare it in `sensitive.keys`. Names like `AUTH` or `KEY` alone are not flagged.
- **Hidden values still reveal that something changed**, along with its path and type. Paths are never redacted, so do not put secrets in key names.
- **JSON Schema is not supported** for validation yet.
- **Input limits:** 5 MiB by default, nesting depth 200, 100 YAML aliases.
- **Not fast.** See [Benchmarks](benchmarks.md).

Every rule also lists its own false-positive limits in [Rules](rules.md).
