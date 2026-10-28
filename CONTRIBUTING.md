# Contributing

```bash
npm install
npm run typecheck && npm run lint && npm run format:check && npm test
npm run test:package   # packs and tests the installed artifact
npm run docs:rules     # regenerate docs/RULES.md after changing rules
```

Rules of the road:

- A new rule needs: stable id, description, default severity, remediation, documented false-positive limits, and tests for detection **and** non-detection.
- Never add a code path that puts a raw config value into a `Change`, `Finding`, `Report` or error message without going through `toView` / redaction. Add a canary case to `tests/security/leaks.test.ts`.
- No new runtime dependency without discussion. No network access, no telemetry, no code execution of config.
- Keep the public API small; anything exported from `src/index.ts` needs a test and docs.
