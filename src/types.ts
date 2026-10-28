export type Severity = "info" | "warning" | "error";
export type FailOn = Severity | "never";
export type ConfigFormat = "env" | "json" | "yaml" | "toml";
export type PathSegment = string | number;
export type ValueType = "string" | "number" | "boolean" | "null" | "array" | "object";
export type CoerceType = "string" | "number" | "integer" | "boolean";

export const RULE_IDS = [
  "missing-in-candidate",
  "type-mismatch",
  "empty-value",
  "required-keys",
  "forbidden-values",
  "environment-mismatch",
  "sensitive-value-changes",
  "sensitive-value-shared",
  "public-secret-exposure",
  "duplicate-keys",
  "possible-rename",
  "watch-paths",
  "coercion-failed",
  "schema-violation",
  "credential-in-url",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** A value as it may appear in a public report. Raw sensitive values never appear here. */
export type ValueView =
  | { present: false }
  | { present: true; type: ValueType; redacted: true }
  | { present: true; type: ValueType; redacted: false; value: unknown };

export interface Change {
  type: "added" | "removed" | "modified";
  /** `a.b[0].c` form. */
  path: string;
  pathSegments: PathSegment[];
  baseline: ValueView;
  candidate: ValueView;
  /** True when both sides have a value but their types differ. */
  typeChanged: boolean;
  /** True when either side was redacted. */
  redacted: boolean;
  /** Rules that produced findings for this path. */
  ruleIds: RuleId[];
  /** Highest severity among findings on this path, if any. */
  severity?: Severity;
  explanation: string;
  /** Only for unordered arrays: how many elements were added / removed. */
  arrayDelta?: { added: number; removed: number };
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** Config path the finding is about, or null for whole-config findings. */
  path: string | null;
  message: string;
  remediation: string;
}

export interface CompareOptions {
  /** Paths (glob: `*`, `**`, `[*]`) excluded from comparison. */
  ignore?: readonly string[];
  /** Paths whose arrays are compared as unordered multisets. */
  unordered?: readonly string[];
  /** Paths whose string values are trimmed before comparison. */
  trim?: readonly string[];
  /** Explicit coercions of string values before comparison, keyed by path glob. */
  coerce?: Record<string, CoerceType>;
  /** Convert CRLF/CR to LF in strings before comparison. Default true. */
  normalizeNewlines?: boolean;
  sensitive?: SensitiveOptions;
}

export interface SensitiveOptions {
  /** Key names or path globs (case-insensitive) whose values are redacted. */
  keys?: readonly string[];
  /** Regular-expression sources matched (case-insensitive) against every path segment. */
  patterns?: readonly string[];
  /** Use the conservative built-in key patterns. Default true. */
  builtin?: boolean;
  /** Redact every value. */
  redactAll?: boolean;
}

export interface Summary {
  added: number;
  removed: number;
  modified: number;
  redacted: number;
  findings: Record<Severity, number>;
}

export interface ComparisonResult {
  schemaVersion: 1;
  summary: Summary;
  changes: Change[];
}

export type SchemaType = "string" | "number" | "integer" | "boolean" | "null" | "array" | "object";

/** Built-in schema: a small JSON-Schema-like subset. */
export interface SchemaNode {
  type?: SchemaType | SchemaType[];
  required?: boolean;
  enum?: ReadonlyArray<string | number | boolean | null>;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** Regular-expression source, tested against string values. */
  pattern?: string;
  /** For objects. */
  properties?: Record<string, SchemaNode>;
  /** For objects: unknown keys policy. Default "allow". */
  unknownKeys?: "allow" | "warn" | "error";
  /** For arrays. */
  items?: SchemaNode;
}

export interface StandardSchemaLike {
  "~standard": {
    validate(value: unknown): StandardResult | Promise<StandardResult>;
  };
}
export interface StandardResult {
  issues?: ReadonlyArray<{
    message: string;
    path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
  }>;
}

export type ConfigSchema = SchemaNode | StandardSchemaLike;

export interface RuleSetting {
  /** Override the default severity. */
  severity?: Severity;
}
export interface RuleOptionsMap {
  "missing-in-candidate": RuleSetting;
  "type-mismatch": RuleSetting;
  "empty-value": RuleSetting;
  "required-keys": RuleSetting & { keys: readonly string[]; allowEmpty?: boolean };
  "forbidden-values": RuleSetting & {
    items: ReadonlyArray<{
      path: string;
      equals?: readonly unknown[];
      pattern?: string;
      message?: string;
    }>;
  };
  "environment-mismatch": RuleSetting & {
    baseline?: string;
    candidate?: string;
    markers?: readonly string[];
  };
  "sensitive-value-changes": RuleSetting;
  "sensitive-value-shared": RuleSetting;
  "public-secret-exposure": RuleSetting & { publicPrefixes?: readonly string[] };
  "duplicate-keys": RuleSetting;
  "possible-rename": RuleSetting;
  "watch-paths": RuleSetting & {
    paths: ReadonlyArray<{ path: string; severity?: Severity; message?: string }>;
  };
  "coercion-failed": RuleSetting;
  "schema-violation": RuleSetting;
  "credential-in-url": RuleSetting;
}

/** `false` disables a rule; `true` enables it with defaults; an object enables with options. */
export type RuleConfig = { [K in RuleId]?: boolean | RuleOptionsMap[K] };

export interface Policy extends CompareOptions {
  baselineName?: string;
  candidateName?: string;
  rules?: RuleConfig;
  schema?: ConfigSchema;
  failOn?: FailOn;
}

export interface Report {
  schemaVersion: 1;
  tool: { name: "configdiff"; version: string };
  mode: "compare" | "check";
  baseline?: { name?: string; format?: ConfigFormat };
  candidate: { name?: string; format?: ConfigFormat };
  failOn: FailOn;
  status: "pass" | "review" | "fail";
  summary: Summary;
  changes: Change[];
  findings: Finding[];
}
