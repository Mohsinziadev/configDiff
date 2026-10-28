import { parseDocument } from "yaml";
import { parse as parseToml } from "smol-toml";
import { ConfigDiffError } from "../errors.js";
import type { ConfigFormat } from "../types.js";
import { parseEnv, stripBom } from "./env.js";
import { ParsedConfig } from "./parsed.js";

export { ParsedConfig } from "./parsed.js";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

function locationFromOffset(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, column: col };
}

/** Convert parser-specific values (Date, bigint) into plain JSON-like data. */
function toPlain(value: unknown, depth = 0): unknown {
  if (depth > 200) throw new ConfigDiffError("PARSE_ERROR", "Configuration is nested too deeply");
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (Array.isArray(value)) return value.map((v) => toPlain(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      Object.defineProperty(out, k, {
        value: toPlain(v, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(stripBom(text));
  } catch (err) {
    // Node's JSON error messages can quote source text, so only extract the position.
    const msg = err instanceof Error ? err.message : "";
    const lc = /line (\d+) column (\d+)/.exec(msg);
    const pos = /position (\d+)/.exec(msg);
    const location = lc
      ? { line: Number(lc[1]), column: Number(lc[2]) }
      : pos
        ? locationFromOffset(text, Number(pos[1]))
        : undefined;
    throw new ConfigDiffError("PARSE_ERROR", "Invalid JSON", location);
  }
}

function parseYaml(text: string): unknown {
  const doc = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  // prettyErrors populates linePos; only `code` and `linePos` are used, never the message (it quotes source).
  const first = doc.errors[0];
  if (first) {
    const pos = first.linePos?.[0];
    throw new ConfigDiffError(
      "PARSE_ERROR",
      `Invalid YAML (${first.code})`,
      pos ? { line: pos.line, column: pos.col } : undefined,
    );
  }
  try {
    return doc.toJS({ maxAliasCount: 100 }) ?? {};
  } catch {
    throw new ConfigDiffError("PARSE_ERROR", "Invalid YAML (alias expansion failed or too large)");
  }
}

function parseTomlText(text: string): unknown {
  try {
    return parseToml(text);
  } catch (err) {
    const e = err as { line?: number; column?: number };
    throw new ConfigDiffError(
      "PARSE_ERROR",
      "Invalid TOML",
      typeof e.line === "number"
        ? { line: e.line, ...(typeof e.column === "number" ? { column: e.column } : {}) }
        : undefined,
    );
  }
}

/** Parse configuration text. Never evaluates code. Errors carry a line/column, not source text. */
export function parseConfig(text: string, format: ConfigFormat): ParsedConfig {
  if (typeof text !== "string") {
    throw new ConfigDiffError("INVALID_OPTIONS", "parseConfig expects a string");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) {
    throw new ConfigDiffError("INPUT_TOO_LARGE", `Input exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  if (format === "env") return parseEnv(text);
  let value: unknown;
  if (format === "json") value = parseJson(text);
  else if (format === "yaml") value = parseYaml(text);
  else if (format === "toml") value = parseTomlText(text);
  else throw new ConfigDiffError("UNSUPPORTED_FORMAT", `Unsupported format: ${String(format)}`);
  const plain = toPlain(value);
  if (plain === null || typeof plain !== "object") {
    throw new ConfigDiffError(
      "PARSE_ERROR",
      `Top-level ${format} value must be an object or array`,
    );
  }
  return new ParsedConfig(format, plain);
}

const EXT: Record<string, ConfigFormat> = {
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".env": "env",
};

/** Guess a format from a file name; returns undefined when unknown. */
export function detectFormat(fileName: string): ConfigFormat | undefined {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const lower = base.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.") || lower.endsWith(".env")) return "env";
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? undefined : EXT[lower.slice(dot)];
}
