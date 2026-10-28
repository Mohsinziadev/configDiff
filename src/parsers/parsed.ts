import type { ConfigFormat } from "../types.js";

/** A parsed configuration plus facts only the parser knows. */
export class ParsedConfig {
  readonly format: ConfigFormat;
  readonly value: unknown;
  /** Env files only: keys that were defined more than once (last definition wins). */
  readonly duplicateKeys: readonly string[];

  constructor(format: ConfigFormat, value: unknown, duplicateKeys: readonly string[] = []) {
    this.format = format;
    this.value = value;
    this.duplicateKeys = duplicateKeys;
  }

  /** Never serialize raw values by accident. */
  toJSON(): { format: ConfigFormat; redacted: true } {
    return { format: this.format, redacted: true };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `ParsedConfig<${this.format}> [values hidden]`;
  }
}
