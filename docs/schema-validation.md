# Schema validation

`validateConfig` checks a single config against a schema and returns the same report shape as `analyzeConfig`, with findings only.

```js
import { parseConfig, validateConfig } from "configdiff";

const report = validateConfig(parseConfig(text, "env"), {
  properties: { PORT: { type: "integer", min: 1, max: 65535, required: true } },
  unknownKeys: "warn",
});
```

Violations are reported by the `schema-violation` rule, at `error` severity by default.

## Standard Schema

Instead of the built-in schema you can pass any [Standard Schema](https://standardschema.dev) validator, such as Zod, Valibot or ArkType. Messages from third-party validators are scrubbed of known sensitive values and replaced entirely for sensitive keys. Async validators need `validateConfigAsync`.

## Limits

JSON Schema is not supported yet. The built-in schema is a deliberately small subset.
