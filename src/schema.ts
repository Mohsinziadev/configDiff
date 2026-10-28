import { ConfigDiffError } from "./errors.js";
import { compileUserRegex, formatPath } from "./path.js";
import type { PathSegment, SchemaNode, SchemaType, StandardSchemaLike } from "./types.js";

export interface SchemaIssue {
  segments: PathSegment[];
  message: string;
  severity: "warning" | "error";
}

export function isStandardSchema(schema: unknown): schema is StandardSchemaLike {
  return (
    typeof schema === "object" &&
    schema !== null &&
    typeof (schema as StandardSchemaLike)["~standard"]?.validate === "function"
  );
}

const SCHEMA_TYPES: SchemaType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "array",
  "object",
];

function actualType(v: unknown): SchemaType | "undefined" {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "boolean";
  return "object";
}

/**
 * String grammar used when `fromStrings` is true (env files). Documented in RULES.md:
 * integer `-?\d+`, number decimal/exponent, boolean exactly `true` or `false`.
 */
function parseFromString(value: string, type: SchemaType): number | boolean | undefined {
  if (type === "integer" && /^-?\d+$/.test(value)) return Number(value);
  if (type === "number" && /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) return Number(value);
  if (type === "boolean" && (value === "true" || value === "false")) return value === "true";
  return undefined;
}

function matchesType(value: unknown, type: SchemaType): boolean {
  const t = actualType(value);
  return t === type || (type === "number" && t === "integer");
}

export function validateBuiltin(
  schema: SchemaNode,
  value: unknown,
  options: { fromStrings: boolean },
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  validateSchemaShape(schema, "schema");

  const visit = (node: SchemaNode, v: unknown, segments: PathSegment[]): void => {
    const issue = (message: string, severity: "warning" | "error" = "error"): void => {
      issues.push({ segments, message, severity });
    };
    if (v === undefined) {
      if (node.required) issue("Required value is missing");
      return;
    }
    let current = v;
    if (node.type) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      let ok = types.some((t) => matchesType(current, t));
      if (!ok && options.fromStrings && typeof current === "string") {
        for (const t of types) {
          const parsed = parseFromString(current, t);
          if (parsed !== undefined) {
            current = parsed;
            ok = true;
            break;
          }
        }
        if (!ok && types.includes("string")) ok = true;
      }
      if (!ok) {
        issue(`Expected ${types.join(" or ")} but found ${actualType(v)}`);
        return;
      }
    }
    if (
      node.enum &&
      !node.enum.some(
        (e) => e === current || (typeof current === "string" && String(e) === current),
      )
    ) {
      issue("Value is not one of the allowed values");
    }
    if (typeof current === "number") {
      if (node.min !== undefined && current < node.min)
        issue(`Value is below the minimum of ${node.min}`);
      if (node.max !== undefined && current > node.max)
        issue(`Value is above the maximum of ${node.max}`);
    }
    if (typeof current === "string") {
      if (node.minLength !== undefined && current.length < node.minLength)
        issue(`Value is shorter than ${node.minLength} characters`);
      if (node.maxLength !== undefined && current.length > node.maxLength)
        issue(`Value is longer than ${node.maxLength} characters`);
      if (
        node.pattern !== undefined &&
        !compileUserRegex(node.pattern, "", "schema.pattern").test(current)
      )
        issue("Value does not match the required pattern");
    }
    if (Array.isArray(current) && node.items) {
      current.forEach((item, i) => visit(node.items as SchemaNode, item, [...segments, i]));
    }
    if (
      node.properties &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      const obj = current as Record<string, unknown>;
      for (const [k, child] of Object.entries(node.properties)) {
        visit(child, Object.hasOwn(obj, k) ? obj[k] : undefined, [...segments, k]);
      }
      const policy = node.unknownKeys ?? "allow";
      if (policy !== "allow") {
        for (const k of Object.keys(obj)) {
          if (!Object.hasOwn(node.properties, k)) {
            issues.push({
              segments: [...segments, k],
              message: "Key is not declared in the schema",
              severity: policy === "error" ? "error" : "warning",
            });
          }
        }
      }
    }
  };
  visit(schema, value, []);
  return issues;
}

function validateSchemaShape(node: SchemaNode, where: string): void {
  if (node === null || typeof node !== "object") {
    throw new ConfigDiffError("SCHEMA_ERROR", `${where}: schema node must be an object`);
  }
  const types = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];
  for (const t of types) {
    if (!SCHEMA_TYPES.includes(t))
      throw new ConfigDiffError("SCHEMA_ERROR", `${where}: unknown type "${String(t)}"`);
  }
  for (const [k, child] of Object.entries(node.properties ?? {}))
    validateSchemaShape(child, `${where}.properties.${k}`);
  if (node.items) validateSchemaShape(node.items, `${where}.items`);
}

export function standardPathToSegments(
  path: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined,
): PathSegment[] {
  return (path ?? []).map((p) => {
    const k = typeof p === "object" ? p.key : p;
    return typeof k === "number" ? k : String(k);
  });
}

export function describePath(segments: PathSegment[]): string {
  return formatPath(segments) || "(root)";
}
