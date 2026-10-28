import { parseConfig, validateConfig } from "configdiff-js";

validateConfig(parseConfig(text, "env"), {
  properties: { PORT: { type: "integer", min: 1, max: 65535, required: true } },
  unknownKeys: "warn",
});
// schema-violation PORT: Value is above the maximum of 65535
