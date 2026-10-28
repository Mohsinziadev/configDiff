# CI/CD

Run ConfigDiff on every pull request that touches configuration, and let the exit code gate the merge.

```yaml
# .github/workflows/config.yml
name: config
on: pull_request
jobs:
  configdiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx --yes configdiff-js@0.1 compare --baseline config/staging.yaml --candidate config/production.yaml --policy configdiff.policy.json --fail-on warning
```

## Why it is safe for logs

Output is plain text with severities spelled out (no colour needed), and sensitive values are redacted when changes are built, not when they are printed. See [Security](security.md).

## Tips

- Use `--fail-on warning` to block on warnings, or `--fail-on never` to report without failing.
- Use `--output json` to feed the report to another tool.
- Pin the version (`configdiff-js@0.1`) so rule changes never surprise a pipeline.

## Troubleshooting

- _"Cannot detect the format"_: pass `--format`.
- _Everything shows as changed in arrays_: arrays are index-ordered; use `unordered`.
- _`3000` vs `"3000"` reported_: declare `coerce`.
- _Too many or too few values redacted_: tune `sensitive.keys`, `sensitive.patterns` and `sensitive.builtin`.
- _Policy rejected_: unknown keys and unknown rule ids are errors by design.
