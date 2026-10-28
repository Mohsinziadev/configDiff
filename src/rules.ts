import { ConfigDiffError } from "./errors.js";
import { canonical } from "./normalize.js";
import { compilePathGlob, compileUserRegex } from "./path.js";
import type { Comparison } from "./compare.js";
import type { Finding, RuleConfig, RuleId, RuleOptionsMap, Severity } from "./types.js";

export interface RuleDefinition {
  id: RuleId;
  description: string;
  defaultSeverity: Severity;
  defaultEnabled: boolean;
  /** Needs a baseline (compare mode). */
  needsBaseline: boolean;
  /** Needs options in the policy before it can run. */
  needsOptions: boolean;
  remediation: string;
  limitations: string;
}

export const RULES: Record<RuleId, RuleDefinition> = {
  "missing-in-candidate": {
    id: "missing-in-candidate",
    description: "A key present in the baseline is absent from the candidate.",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: true,
    needsOptions: false,
    remediation: "Add the key to the candidate, or remove it from the baseline if it is obsolete.",
    limitations:
      "Cannot tell an intentional removal from an accidental one. Renamed keys also appear here (see possible-rename).",
  },
  "type-mismatch": {
    id: "type-mismatch",
    description: "A value has a different type in the candidate (for example number vs string).",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: true,
    needsOptions: false,
    remediation: "Confirm the new type is intended, or declare coercion/schema types for the path.",
    limitations:
      "Env files are all strings, so env-to-env comparisons never produce type changes without coerce.",
  },
  "empty-value": {
    id: "empty-value",
    description: "A string that had content in the baseline is empty in the candidate.",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: true,
    needsOptions: false,
    remediation: "Set a value, or remove the key if it is meant to be unset.",
    limitations: "Some keys are legitimately empty in some environments.",
  },
  "required-keys": {
    id: "required-keys",
    description: "A key listed in the policy is missing or empty in the candidate.",
    defaultSeverity: "error",
    defaultEnabled: false,
    needsBaseline: false,
    needsOptions: true,
    remediation: "Define the key with a non-empty value, or remove it from the required list.",
    limitations:
      "Only checks presence/emptiness, not whether the value is valid. Use a schema for that.",
  },
  "forbidden-values": {
    id: "forbidden-values",
    description: "A value equals a forbidden value or matches a forbidden pattern for its path.",
    defaultSeverity: "error",
    defaultEnabled: false,
    needsBaseline: false,
    needsOptions: true,
    remediation: "Change the value to one the policy allows.",
    limitations:
      "Patterns are regular expressions supplied by the policy author; ConfigDiff does not check them for catastrophic backtracking beyond a 500-character limit.",
  },
  "environment-mismatch": {
    id: "environment-mismatch",
    description:
      "A candidate string contains a marker naming another environment (for example `staging` in a production value).",
    defaultSeverity: "warning",
    defaultEnabled: false,
    needsBaseline: false,
    needsOptions: true,
    remediation: "Verify the value belongs to the candidate environment.",
    limitations:
      "Word-boundary text match only. `staging` inside a legitimate hostname or comment triggers it; use markers specific to your naming.",
  },
  "sensitive-value-changes": {
    id: "sensitive-value-changes",
    description: "A value classified as sensitive changed. Values are never shown.",
    defaultSeverity: "info",
    defaultEnabled: false,
    needsBaseline: true,
    needsOptions: false,
    remediation: "Confirm the rotation or change was intended.",
    limitations:
      "Sensitivity is heuristic (key names, value shapes, your declarations). Expected to fire often between environments.",
  },
  "sensitive-value-shared": {
    id: "sensitive-value-shared",
    description: "The same sensitive value appears in both baseline and candidate.",
    defaultSeverity: "warning",
    defaultEnabled: false,
    needsBaseline: true,
    needsOptions: false,
    remediation: "Use a distinct secret per environment.",
    limitations:
      "Only meaningful when baseline and candidate are different environments. Sensitivity is heuristic.",
  },
  "public-secret-exposure": {
    id: "public-secret-exposure",
    description:
      "A key with a client-exposed prefix (such as NEXT_PUBLIC_) has a secret-like name or value.",
    defaultSeverity: "error",
    defaultEnabled: true,
    needsBaseline: false,
    needsOptions: false,
    remediation:
      "Move the value to a server-only variable and expose only a public identifier to the client.",
    limitations:
      "Name/shape based. Names such as *_TOKEN or *_KEY are not flagged because many public identifiers use them; secrets with innocuous names are missed.",
  },
  "duplicate-keys": {
    id: "duplicate-keys",
    description: "An env file defines the same key more than once; the last definition wins.",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: false,
    needsOptions: false,
    remediation: "Remove the earlier definitions.",
    limitations:
      "Env files only. JSON silently keeps the last duplicate and YAML rejects duplicates as a parse error; TOML rejects them too.",
  },
  "possible-rename": {
    id: "possible-rename",
    description: "A removed key and an added key share an identical string value of 6+ characters.",
    defaultSeverity: "info",
    defaultEnabled: true,
    needsBaseline: true,
    needsOptions: false,
    remediation: "If this is a rename, update consumers of the old key.",
    limitations:
      "Evidence is value equality only, and only when the value is unique on both sides. Renames that also change the value are not detected.",
  },
  "watch-paths": {
    id: "watch-paths",
    description: "A path you asked to watch changed.",
    defaultSeverity: "warning",
    defaultEnabled: false,
    needsBaseline: true,
    needsOptions: true,
    remediation: "Review the change against the intent recorded in the policy message.",
    limitations: "Fires on any change to the matching path, including harmless ones.",
  },
  "coercion-failed": {
    id: "coercion-failed",
    description:
      "A value could not be coerced to the type declared in `coerce`; it was compared unmodified.",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: false,
    needsOptions: false,
    remediation: "Fix the value or the coerce declaration.",
    limitations:
      "Accepted grammar is strict: integer `-?\\d+`, number decimal/exponent, boolean exactly `true`/`false`.",
  },
  "schema-violation": {
    id: "schema-violation",
    description: "The candidate violates the supplied schema.",
    defaultSeverity: "error",
    defaultEnabled: true,
    needsBaseline: false,
    needsOptions: false,
    remediation: "Fix the value or update the schema.",
    limitations:
      "Runs only when a schema is supplied. Standard Schema issue messages from third-party validators are scrubbed of known sensitive values, but cannot be audited in general.",
  },
  "credential-in-url": {
    id: "credential-in-url",
    description: "A candidate string contains a URL with embedded `user:password@` credentials.",
    defaultSeverity: "warning",
    defaultEnabled: true,
    needsBaseline: false,
    needsOptions: false,
    remediation:
      "Provide credentials through a separate secret variable or secret manager where the consumer supports it.",
    limitations:
      "Many connection strings legitimately embed credentials. Disable the rule if that is your convention.",
  },
};

export function listRules(): RuleDefinition[] {
  return Object.values(RULES);
}

export interface RuleContext {
  cmp: Comparison;
  hasBaseline: boolean;
  config: RuleConfig;
  baselineName: string | undefined;
  candidateName: string | undefined;
  duplicateKeys: { baseline: readonly string[]; candidate: readonly string[] };
}

const PUBLIC_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "REACT_APP_",
  "NUXT_PUBLIC_",
  "EXPO_PUBLIC_",
  "PUBLIC_",
  "GATSBY_",
];
const PUBLIC_SECRET_NAMES = [/secret/i, /passw(or)?d/i, /private[_-]?key/i, /credential/i];

export function isEnabled(config: RuleConfig, id: RuleId): boolean {
  const c = config[id];
  if (c === false) return false;
  if (c === undefined) return RULES[id].defaultEnabled;
  return true;
}

function opts<K extends RuleId>(config: RuleConfig, id: K): Partial<RuleOptionsMap[K]> {
  const c = config[id];
  return (typeof c === "object" && c !== null ? c : {}) as Partial<RuleOptionsMap[K]>;
}

export function severityFor(config: RuleConfig, id: RuleId): Severity {
  return (opts(config, id) as { severity?: Severity }).severity ?? RULES[id].defaultSeverity;
}

function requireOptions(config: RuleConfig, id: RuleId, field: string): void {
  const o = opts(config, id) as Record<string, unknown>;
  if (!Array.isArray(o[field]) || (o[field] as unknown[]).length === 0) {
    throw new ConfigDiffError(
      "INVALID_POLICY",
      `Rule "${id}" requires a non-empty "${field}" option`,
    );
  }
}

const isString = (v: unknown): v is string => typeof v === "string";

/** Run every enabled rule. Messages never contain raw sensitive values. */
export function runRules(ctx: RuleContext): Finding[] {
  const { cmp, config } = ctx;
  const out: Finding[] = [];
  const make = (
    id: RuleId,
    path: string | null,
    message: string,
    severity?: Severity,
  ): Finding => ({
    ruleId: id,
    severity: severity ?? severityFor(config, id),
    path,
    message,
    remediation: RULES[id].remediation,
  });
  const on = (id: RuleId): boolean => {
    if (!isEnabled(config, id)) return false;
    if (RULES[id].needsBaseline && !ctx.hasBaseline) return false;
    if (RULES[id].needsOptions) {
      const field =
        id === "required-keys"
          ? "keys"
          : id === "forbidden-values"
            ? "items"
            : id === "watch-paths"
              ? "paths"
              : null;
      if (field) requireOptions(config, id, field);
    }
    return true;
  };

  const entries = cmp.entries;
  const candLeaves = [...cmp.candNorm.leaves.values()];

  if (on("missing-in-candidate")) {
    for (const e of entries) {
      if (e.change.type === "removed")
        out.push(
          make(
            "missing-in-candidate",
            e.change.path,
            "Key exists in the baseline but is missing from the candidate.",
          ),
        );
    }
  }
  if (on("type-mismatch")) {
    for (const e of entries) {
      if (e.change.typeChanged) {
        out.push(
          make(
            "type-mismatch",
            e.change.path,
            `Type changed from ${e.base?.type} to ${e.cand?.type}.`,
          ),
        );
      }
    }
  }
  if (on("empty-value")) {
    for (const e of entries) {
      if (
        e.change.type === "modified" &&
        e.cand?.value === "" &&
        typeof e.base?.value === "string" &&
        e.base.value !== ""
      ) {
        out.push(
          make(
            "empty-value",
            e.change.path,
            "Value is empty in the candidate but was not empty in the baseline.",
          ),
        );
      }
    }
  }
  if (on("sensitive-value-changes")) {
    for (const e of entries) {
      if (e.change.type === "modified" && e.sensitive)
        out.push(
          make(
            "sensitive-value-changes",
            e.change.path,
            "A sensitive value changed (values hidden).",
          ),
        );
    }
  }
  if (on("sensitive-value-shared") && cmp.baseNorm) {
    for (const [key, cand] of cmp.candNorm.leaves) {
      const base = cmp.baseNorm.leaves.get(key);
      if (!base || cand.value === "" || canonical(base.value) !== canonical(cand.value)) continue;
      if (cmp.redactor.isSensitive(cand.segments, cand.value)) {
        out.push(
          make(
            "sensitive-value-shared",
            cand.path,
            "The same sensitive value is used in baseline and candidate (value hidden).",
          ),
        );
      }
    }
  }
  if (on("possible-rename")) {
    const removed = entries.filter(
      (e) =>
        e.change.type === "removed" &&
        isString(e.base?.value) &&
        (e.base?.value as string).length >= 6,
    );
    const added = entries.filter(
      (e) =>
        e.change.type === "added" &&
        isString(e.cand?.value) &&
        (e.cand?.value as string).length >= 6,
    );
    const count = (list: typeof removed, side: "base" | "cand"): Map<string, number> => {
      const m = new Map<string, number>();
      for (const e of list) {
        const v = (side === "base" ? e.base : e.cand)?.value as string;
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return m;
    };
    const rc = count(removed, "base");
    const ac = count(added, "cand");
    for (const r of removed) {
      const v = r.base?.value as string;
      if (rc.get(v) !== 1 || ac.get(v) !== 1) continue;
      const a = added.find((x) => x.cand?.value === v);
      if (a)
        out.push(
          make(
            "possible-rename",
            r.change.path,
            `Possibly renamed to "${a.change.path}": both hold an identical value (value not shown).`,
          ),
        );
    }
  }
  if (on("watch-paths")) {
    const items = ((opts(config, "watch-paths") as RuleOptionsMap["watch-paths"]).paths ?? []).map(
      (p) => ({ ...p, match: compilePathGlob(p.path) }),
    );
    for (const e of entries) {
      for (const item of items) {
        if (item.match(e.change.path)) {
          out.push(
            make(
              "watch-paths",
              e.change.path,
              `${item.message ?? "Watched path changed."} ${e.change.explanation}`,
              item.severity,
            ),
          );
        }
      }
    }
  }
  if (on("required-keys")) {
    const o = opts(config, "required-keys") as RuleOptionsMap["required-keys"];
    for (const key of o.keys) {
      const match = compilePathGlob(key);
      const found = candLeaves.filter((l) => match(l.path));
      if (found.length === 0) out.push(make("required-keys", key, "Required key is missing."));
      else if (o.allowEmpty !== true && found.every((l) => l.value === "" || l.value === null)) {
        out.push(make("required-keys", key, "Required key is present but empty."));
      }
    }
  }
  if (on("forbidden-values")) {
    const o = opts(config, "forbidden-values") as RuleOptionsMap["forbidden-values"];
    for (const item of o.items) {
      const match = compilePathGlob(item.path);
      const re =
        item.pattern === undefined
          ? undefined
          : compileUserRegex(item.pattern, "", "forbidden-values.pattern");
      const equals = (item.equals ?? []).map(canonical);
      for (const leaf of candLeaves) {
        if (!match(leaf.path)) continue;
        const hit =
          equals.includes(canonical(leaf.value)) ||
          (re !== undefined && isString(leaf.value) && re.test(leaf.value));
        if (hit)
          out.push(
            make(
              "forbidden-values",
              leaf.path,
              item.message ?? "Value is forbidden by policy (value not shown).",
            ),
          );
      }
    }
  }
  if (on("environment-mismatch")) {
    const o = opts(config, "environment-mismatch") as RuleOptionsMap["environment-mismatch"];
    const markers = (o.markers ?? [o.baseline ?? ctx.baselineName])
      .filter(isString)
      .filter((m) => m !== "");
    if (markers.length === 0) {
      throw new ConfigDiffError(
        "INVALID_POLICY",
        'Rule "environment-mismatch" needs markers or a baseline name',
      );
    }
    const res = markers.map((m) => ({
      m,
      re: new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"),
    }));
    for (const leaf of candLeaves) {
      if (!isString(leaf.value)) continue;
      const hit = res.find((r) => r.re.test(leaf.value as string));
      if (hit)
        out.push(
          make(
            "environment-mismatch",
            leaf.path,
            `Candidate value contains the marker "${hit.m}" (value not shown).`,
          ),
        );
    }
  }
  if (on("public-secret-exposure")) {
    const o = opts(config, "public-secret-exposure") as RuleOptionsMap["public-secret-exposure"];
    const prefixes = o.publicPrefixes ?? PUBLIC_PREFIXES;
    for (const leaf of candLeaves) {
      const top = leaf.segments[0];
      if (typeof top !== "string") continue;
      const prefix = prefixes.find((p) => top.startsWith(p));
      if (!prefix) continue;
      const rest = top.slice(prefix.length);
      if (
        PUBLIC_SECRET_NAMES.some((re) => re.test(rest)) ||
        cmp.redactor.isSensitiveValue(leaf.value)
      ) {
        out.push(
          make(
            "public-secret-exposure",
            leaf.path,
            `"${prefix}" variables are exposed to client code, but this one looks secret.`,
          ),
        );
      }
    }
  }
  if (on("credential-in-url")) {
    for (const leaf of candLeaves) {
      if (
        typeof leaf.value === "string" &&
        /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i.test(leaf.value)
      ) {
        out.push(
          make(
            "credential-in-url",
            leaf.path,
            "Value is a URL with embedded credentials (value hidden).",
          ),
        );
      }
    }
  }
  if (on("duplicate-keys")) {
    for (const k of ctx.duplicateKeys.candidate)
      out.push(
        make(
          "duplicate-keys",
          k,
          "Key is defined more than once in the candidate; the last definition wins.",
        ),
      );
    for (const k of ctx.duplicateKeys.baseline)
      out.push(
        make(
          "duplicate-keys",
          k,
          "Key is defined more than once in the baseline; the last definition wins.",
        ),
      );
  }
  if (on("coercion-failed")) {
    for (const [side, norm] of [
      ["baseline", cmp.baseNorm],
      ["candidate", cmp.candNorm],
    ] as const) {
      for (const f of norm?.coercionFailures ?? []) {
        out.push(
          make(
            "coercion-failed",
            f.path,
            `The ${side} value could not be coerced to ${f.to}; it was compared unmodified.`,
          ),
        );
      }
    }
  }
  return out;
}
