import { ConfigDiffError } from "../errors.js";
import { ParsedConfig } from "./parsed.js";

export const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Parse dotenv text. Supported subset (documented in README):
 * `KEY=value`, optional `export `, `#` comments, single/double quotes (may span lines),
 * double-quote escapes `\n \r \t \" \\`, inline ` #` comments on unquoted values.
 * No variable interpolation, no command substitution. Malformed lines are errors.
 */
export function parseEnv(text: string): ParsedConfig {
  const values = new Map<string, string>();
  const duplicates = new Set<string>();
  const src = stripBom(text);
  let i = 0;
  let line = 1;

  const fail = (msg: string, ln = line): never => {
    throw new ConfigDiffError("PARSE_ERROR", `Invalid env file: ${msg}`, { line: ln });
  };

  while (i < src.length) {
    // skip blank space / comments at line start
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    if (i >= src.length) break;
    if (src[i] === "\n") {
      i++;
      line++;
      continue;
    }
    if (src[i] === "\r") {
      i++;
      continue;
    }
    if (src[i] === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    const startLine = line;
    let eq = i;
    while (eq < src.length && src[eq] !== "=" && src[eq] !== "\n") eq++;
    if (src[eq] !== "=") fail("line is not in KEY=VALUE form", startLine);
    let key = src.slice(i, eq).trim();
    if (key.startsWith("export ")) key = key.slice(7).trim();
    if (!KEY_RE.test(key)) fail("invalid variable name", startLine);
    i = eq + 1;
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;

    let value = "";
    const q = src[i];
    if (q === '"' || q === "'") {
      i++;
      let closed = false;
      while (i < src.length) {
        const c = src[i] as string;
        if (c === q) {
          closed = true;
          i++;
          break;
        }
        if (c === "\n") line++;
        if (q === '"' && c === "\\" && i + 1 < src.length) {
          const n = src[i + 1] as string;
          const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
          if (n in map) {
            value += map[n];
            i += 2;
            continue;
          }
        }
        value += c;
        i++;
      }
      if (!closed) fail("unterminated quoted value", startLine);
      // only whitespace or a comment may follow the closing quote
      while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
      if (i < src.length && src[i] !== "\n" && src[i] !== "\r" && src[i] !== "#") {
        fail("unexpected characters after closing quote");
      }
      while (i < src.length && src[i] !== "\n") i++;
    } else {
      let end = i;
      while (end < src.length && src[end] !== "\n") end++;
      let raw = src.slice(i, end);
      const hash = raw.search(/(^|\s)#/);
      if (hash !== -1) raw = raw.slice(0, hash);
      value = raw.trim();
      i = end;
    }
    if (values.has(key)) duplicates.add(key);
    values.set(key, value);
  }
  return new ParsedConfig("env", Object.fromEntries(values), [...duplicates]);
}
