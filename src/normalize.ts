import { ConfigDiffError } from "./errors.js";
import { compileGlobs, comparePaths, formatPath } from "./path.js";
import type { CoerceType, CompareOptions, PathSegment, ValueType } from "./types.js";

export interface Leaf {
  segments: PathSegment[];
  path: string;
  type: ValueType;
  value: unknown;
}

export interface Normalized {
  leaves: Map<string, Leaf>;
  coercionFailures: Array<{ path: string; segments: PathSegment[]; to: CoerceType }>;
}

const MAX_DEPTH = 200;

export function typeOf(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      throw new ConfigDiffError(
        "INVALID_OPTIONS",
        `Unsupported value type: ${typeof value}. Only JSON-compatible values can be compared`,
      );
  }
}

function coerce(value: unknown, to: CoerceType): { ok: true; value: unknown } | { ok: false } {
  if (to === "string") {
    return typeof value === "string"
      ? { ok: true, value }
      : typeof value === "number" || typeof value === "boolean"
        ? { ok: true, value: String(value) }
        : { ok: false };
  }
  if (to === "boolean") {
    if (typeof value === "boolean") return { ok: true, value };
    if (value === "true") return { ok: true, value: true };
    if (value === "false") return { ok: true, value: false };
    return { ok: false };
  }
  if (typeof value === "number") {
    return to === "integer" && !Number.isSafeInteger(value) ? { ok: false } : { ok: true, value };
  }
  if (typeof value !== "string") return { ok: false };
  const re = to === "integer" ? /^-?\d+$/ : /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  if (!re.test(value)) return { ok: false };
  const n = Number(value);
  if (!Number.isFinite(n) || (to === "integer" && !Number.isSafeInteger(n))) return { ok: false };
  return { ok: true, value: n };
}

/** Stable JSON used to compare unordered array elements. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function normalizeConfig(root: unknown, options: CompareOptions = {}): Normalized {
  const ignored = compileGlobs(options.ignore);
  const unordered = compileGlobs(options.unordered);
  const trimmed = compileGlobs(options.trim);
  const coerceRules = Object.entries(options.coerce ?? {}).map(
    ([glob, to]) => [compileGlobs([glob]), to] as const,
  );
  const newlines = options.normalizeNewlines !== false;
  const leaves = new Map<string, Leaf>();
  const coercionFailures: Normalized["coercionFailures"] = [];

  const add = (segments: PathSegment[], path: string, value: unknown): void => {
    leaves.set(JSON.stringify(segments), { segments, path, type: typeOf(value), value });
  };

  const walk = (value: unknown, segments: PathSegment[], depth: number): void => {
    if (depth > MAX_DEPTH) {
      throw new ConfigDiffError(
        "INVALID_OPTIONS",
        `Configuration is nested deeper than ${MAX_DEPTH}`,
      );
    }
    const path = formatPath(segments);
    if (ignored(path)) return;

    if (Array.isArray(value)) {
      if (value.length === 0 && segments.length === 0) return;
      if (value.length === 0 || unordered(path)) add(segments, path, value);
      else value.forEach((v, i) => walk(v, [...segments, i], depth + 1));
      return;
    }
    if (value !== null && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        if (segments.length > 0) add(segments, path, value);
      } else
        for (const k of keys)
          walk((value as Record<string, unknown>)[k], [...segments, k], depth + 1);
      return;
    }
    let v: unknown = value;
    if (typeof value === "string") {
      let str = value;
      if (newlines) str = str.replace(/\r\n?/g, "\n");
      if (trimmed(path)) str = str.trim();
      v = str;
    }
    for (const [match, to] of coerceRules) {
      if (!match(path)) continue;
      const res = coerce(v, to);
      if (res.ok) v = res.value;
      else coercionFailures.push({ path, segments, to });
      break;
    }
    add(segments, path, v);
  };

  walk(root, [], 0);
  coercionFailures.sort((a, b) => comparePaths(a.segments, b.segments));
  return { leaves, coercionFailures };
}
