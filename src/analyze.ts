import { runComparison, type Comparison } from "./compare.js";
import { ConfigDiffError } from "./errors.js";
import { comparePaths, formatPath } from "./path.js";
import { ParsedConfig, parseConfig } from "./parsers/index.js";
import { isEnabled, runRules, severityFor } from "./rules.js";
import { isStandardSchema, standardPathToSegments, validateBuiltin } from "./schema.js";
import type {
  Change,
  CompareOptions,
  ComparisonResult,
  ConfigSchema,
  FailOn,
  Finding,
  Policy,
  Report,
  Severity,
  Summary,
} from "./types.js";
import { VERSION } from "./version.js";

export type ConfigInput = unknown | ParsedConfig;

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

const unwrap = (v: ConfigInput): { value: unknown; parsed: ParsedConfig | undefined } =>
  v instanceof ParsedConfig ? { value: v.value, parsed: v } : { value: v, parsed: undefined };

function summarize(changes: Change[], findings: Finding[]): Summary {
  const s: Summary = {
    added: 0,
    removed: 0,
    modified: 0,
    redacted: changes.filter((c) => c.redacted).length,
    findings: { info: 0, warning: 0, error: 0 },
  };
  for (const c of changes) s[c.type]++;
  for (const f of findings) s.findings[f.severity]++;
  return s;
}

/** Compare two configurations structurally. Returns changes only (no rule evaluation). */
export function compareConfigs(
  baseline: ConfigInput,
  candidate: ConfigInput,
  options: CompareOptions = {},
): ComparisonResult {
  const cmp = runComparison(unwrap(baseline).value, unwrap(candidate).value, options);
  const changes = cmp.entries.map((e) => e.change);
  return { schemaVersion: 1, summary: summarize(changes, []), changes };
}

/** Compare two env files (text) or env maps. Values are compared as strings. */
export function compareEnv(
  baseline: string | Record<string, string>,
  candidate: string | Record<string, string>,
  options: CompareOptions = {},
): ComparisonResult {
  const toParsed = (v: string | Record<string, string>): ParsedConfig =>
    typeof v === "string" ? parseConfig(v, "env") : new ParsedConfig("env", v);
  return compareConfigs(toParsed(baseline), toParsed(candidate), options);
}

function schemaFindings(
  schema: ConfigSchema,
  candidate: { value: unknown; parsed: ParsedConfig | undefined },
  cmp: Comparison,
  config: Policy["rules"],
  isAsync: false,
): Finding[];
function schemaFindings(
  schema: ConfigSchema,
  candidate: { value: unknown; parsed: ParsedConfig | undefined },
  cmp: Comparison,
  config: Policy["rules"],
  isAsync: true,
): Promise<Finding[]>;
function schemaFindings(
  schema: ConfigSchema,
  candidate: { value: unknown; parsed: ParsedConfig | undefined },
  cmp: Comparison,
  config: Policy["rules"],
  isAsync: boolean,
): Finding[] | Promise<Finding[]> {
  const rules = config ?? {};
  const severity = severityFor(rules, "schema-violation");
  const remediation = "Fix the value or update the schema.";
  const fromIssues = (
    issues: Array<{ segments: Array<string | number>; message: string; severity?: Severity }>,
  ): Finding[] =>
    issues.map((i) => {
      const sensitive = cmp.redactor.isSensitiveKey(i.segments);
      const message = sensitive
        ? "Value violates the schema (details hidden because the key is sensitive)."
        : cmp.scrubber.scrub(i.message);
      return {
        ruleId: "schema-violation" as const,
        severity: i.severity === "warning" && severity === "error" ? "warning" : severity,
        path: formatPath(i.segments) || null,
        message,
        remediation,
      };
    });

  if (isStandardSchema(schema)) {
    const res = schema["~standard"].validate(candidate.value);
    if (res instanceof Promise) {
      if (!isAsync) {
        throw new ConfigDiffError(
          "ASYNC_VALIDATOR",
          "This schema validates asynchronously. Use validateConfigAsync() or analyzeConfigAsync()",
        );
      }
      return res.then((r) =>
        fromIssues(
          (r.issues ?? []).map((i) => ({
            segments: standardPathToSegments(i.path),
            message: i.message,
          })),
        ),
      );
    }
    const found = fromIssues(
      (res.issues ?? []).map((i) => ({
        segments: standardPathToSegments(i.path),
        message: i.message,
      })),
    );
    return isAsync ? Promise.resolve(found) : found;
  }
  const issues = validateBuiltin(schema, candidate.value, {
    fromStrings: candidate.parsed?.format === "env",
  });
  const found = fromIssues(issues.map((i) => ({ ...i })));
  return isAsync ? Promise.resolve(found) : found;
}

export interface AnalyzeInput {
  /** Omit for single-config checking. */
  baseline?: ConfigInput;
  candidate: ConfigInput;
  policy?: Policy;
}

function buildReport(input: AnalyzeInput, extra: Finding[]): Report {
  const policy = input.policy ?? {};
  const hasBaseline = input.baseline !== undefined;
  const base = hasBaseline ? unwrap(input.baseline) : undefined;
  const cand = unwrap(input.candidate);
  const cmp = runComparison(base?.value, cand.value, policy, hasBaseline);
  const config = policy.rules ?? {};

  const findings = [
    ...runRules({
      cmp,
      hasBaseline,
      config,
      baselineName: policy.baselineName,
      candidateName: policy.candidateName,
      duplicateKeys: {
        baseline: base?.parsed?.duplicateKeys ?? [],
        candidate: cand.parsed?.duplicateKeys ?? [],
      },
    }),
    ...extra,
  ];
  // Final defence: scrub every free-text field against known sensitive values.
  for (const f of findings) f.message = cmp.scrubber.scrub(f.message);

  findings.sort((a, b) => {
    if (a.path === null || b.path === null) return a.path === b.path ? 0 : a.path === null ? -1 : 1;
    return (
      comparePaths([a.path], [b.path]) || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0)
    );
  });

  const changes = cmp.entries.map((e) => e.change);
  for (const c of changes) {
    for (const f of findings) {
      if (f.path !== c.path) continue;
      if (!c.ruleIds.includes(f.ruleId)) c.ruleIds.push(f.ruleId);
      if (!c.severity || SEVERITY_RANK[f.severity] > SEVERITY_RANK[c.severity])
        c.severity = f.severity;
    }
  }
  const failOn: FailOn = policy.failOn ?? "error";
  const threshold = failOn === "never" ? Infinity : SEVERITY_RANK[failOn];
  const failing = findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
  return {
    schemaVersion: 1,
    tool: { name: "configdiff", version: VERSION },
    mode: hasBaseline ? "compare" : "check",
    ...(hasBaseline
      ? {
          baseline: {
            ...(policy.baselineName ? { name: policy.baselineName } : {}),
            ...(base?.parsed ? { format: base.parsed.format } : {}),
          },
        }
      : {}),
    candidate: {
      ...(policy.candidateName ? { name: policy.candidateName } : {}),
      ...(cand.parsed ? { format: cand.parsed.format } : {}),
    },
    failOn,
    status: failing ? "fail" : findings.length > 0 ? "review" : "pass",
    summary: summarize(changes, findings),
    changes,
    findings,
  };
}

function schemaEnabled(policy: Policy | undefined): boolean {
  return policy?.schema !== undefined && isEnabled(policy.rules ?? {}, "schema-violation");
}

function prepare(input: AnalyzeInput): Comparison {
  const policy = input.policy ?? {};
  const hasBaseline = input.baseline !== undefined;
  return runComparison(
    hasBaseline ? unwrap(input.baseline).value : undefined,
    unwrap(input.candidate).value,
    policy,
    hasBaseline,
  );
}

/** Compare (when a baseline is given) and evaluate policy rules. */
export function analyzeConfig(input: AnalyzeInput): Report {
  const extra = schemaEnabled(input.policy)
    ? schemaFindings(
        input.policy?.schema as ConfigSchema,
        unwrap(input.candidate),
        prepare(input),
        input.policy?.rules,
        false,
      )
    : [];
  return buildReport(input, extra);
}

/** Like analyzeConfig, but supports schemas that validate asynchronously. */
export async function analyzeConfigAsync(input: AnalyzeInput): Promise<Report> {
  const extra = schemaEnabled(input.policy)
    ? await schemaFindings(
        input.policy?.schema as ConfigSchema,
        unwrap(input.candidate),
        prepare(input),
        input.policy?.rules,
        true,
      )
    : [];
  return buildReport(input, extra);
}

/** Validate one configuration against a schema (plus the single-config rules). */
export function validateConfig(
  config: ConfigInput,
  schema: ConfigSchema,
  policy: Policy = {},
): Report {
  return analyzeConfig({ candidate: config, policy: { ...policy, schema } });
}

export function validateConfigAsync(
  config: ConfigInput,
  schema: ConfigSchema,
  policy: Policy = {},
): Promise<Report> {
  return analyzeConfigAsync({ candidate: config, policy: { ...policy, schema } });
}
