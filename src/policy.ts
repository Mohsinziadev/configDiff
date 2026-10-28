import { ConfigDiffError } from "./errors.js";
import { RULE_IDS, type FailOn, type Policy } from "./types.js";

const POLICY_KEYS = new Set([
  "version",
  "baselineName",
  "candidateName",
  "rules",
  "schema",
  "failOn",
  "ignore",
  "unordered",
  "trim",
  "coerce",
  "normalizeNewlines",
  "sensitive",
]);
const SENSITIVE_KEYS = new Set(["keys", "patterns", "builtin", "redactAll"]);
const FAIL_ON: FailOn[] = ["info", "warning", "error", "never"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStrList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function bad(msg: string): never {
  throw new ConfigDiffError("INVALID_POLICY", msg);
}

/** Validate an untrusted policy object (for example parsed from JSON). Unknown keys are errors to catch typos. */
export function validatePolicy(input: unknown): Policy {
  if (!isObj(input)) bad("Policy must be an object");
  const p = input as Record<string, unknown>;
  for (const k of Object.keys(p)) if (!POLICY_KEYS.has(k)) bad(`Unknown policy key "${k}"`);
  if (p.version !== undefined && p.version !== 1) bad("Unsupported policy version (expected 1)");
  for (const k of ["ignore", "unordered", "trim"]) {
    if (p[k] !== undefined && !isStrList(p[k])) bad(`"${k}" must be an array of strings`);
  }
  for (const k of ["baselineName", "candidateName"]) {
    if (p[k] !== undefined && typeof p[k] !== "string") bad(`"${k}" must be a string`);
  }
  if (p.normalizeNewlines !== undefined && typeof p.normalizeNewlines !== "boolean")
    bad('"normalizeNewlines" must be a boolean');
  if (p.failOn !== undefined && !FAIL_ON.includes(p.failOn as FailOn))
    bad(`"failOn" must be one of ${FAIL_ON.join(", ")}`);
  if (p.coerce !== undefined) {
    if (!isObj(p.coerce)) bad('"coerce" must be an object');
    for (const v of Object.values(p.coerce as object)) {
      if (!["string", "number", "integer", "boolean"].includes(v as string))
        bad('"coerce" values must be string, number, integer or boolean');
    }
  }
  if (p.sensitive !== undefined) {
    if (!isObj(p.sensitive)) bad('"sensitive" must be an object');
    const s = p.sensitive as Record<string, unknown>;
    for (const k of Object.keys(s)) if (!SENSITIVE_KEYS.has(k)) bad(`Unknown sensitive key "${k}"`);
    if (s.keys !== undefined && !isStrList(s.keys))
      bad('"sensitive.keys" must be an array of strings');
    if (s.patterns !== undefined && !isStrList(s.patterns))
      bad('"sensitive.patterns" must be an array of strings');
  }
  if (p.rules !== undefined) {
    if (!isObj(p.rules)) bad('"rules" must be an object');
    for (const [id, v] of Object.entries(p.rules as object)) {
      if (!(RULE_IDS as readonly string[]).includes(id)) bad(`Unknown rule "${id}"`);
      if (typeof v !== "boolean" && !isObj(v)) bad(`Rule "${id}" must be a boolean or an object`);
    }
  }
  if (p.schema !== undefined && !isObj(p.schema)) bad('"schema" must be an object');
  return p as Policy;
}
