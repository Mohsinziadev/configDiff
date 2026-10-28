import type { Change, Report, ValueView } from "./types.js";

export interface FormatOptions {
  /** Only summary, findings and result. */
  quiet?: boolean;
  /** Do not truncate values. */
  verbose?: boolean;
}

// Strip control characters so config keys/names cannot inject terminal escape sequences.
// eslint-disable-next-line no-control-regex
const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");

function val(v: ValueView, full: boolean): string {
  if (!v.present) return "(absent)";
  if (v.redacted) return "[REDACTED]";
  const s = JSON.stringify(v.value) ?? "null";
  return !full && s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function changeLine(c: Change, full: boolean): string {
  const mark = c.type === "added" ? "+" : c.type === "removed" ? "-" : "~";
  const path = clean(c.path);
  if (c.type === "added") return `  ${mark} ${path}  ${val(c.candidate, full)}`;
  if (c.type === "removed") return `  ${mark} ${path}  ${val(c.baseline, full)}`;
  return `  ${mark} ${path}  ${val(c.baseline, full)} -> ${val(c.candidate, full)}`;
}

/** Human-readable report. Plain text only; severity is always spelled out, never colour-only. */
export function formatText(report: Report, options: FormatOptions = {}): string {
  const out: string[] = ["ConfigDiff — Configuration Analysis", ""];
  if (report.mode === "compare") {
    out.push(`Baseline:  ${clean(report.baseline?.name ?? report.baseline?.format ?? "baseline")}`);
  }
  out.push(
    `Candidate: ${clean(report.candidate.name ?? report.candidate.format ?? "candidate")}`,
    "",
  );
  const s = report.summary;
  out.push("Summary");
  if (report.mode === "compare") {
    out.push(`  Added:     ${s.added}`, `  Removed:   ${s.removed}`, `  Modified:  ${s.modified}`);
  }
  out.push(
    `  Findings:  ${s.findings.error + s.findings.warning + s.findings.info}` +
      ` (error ${s.findings.error}, warning ${s.findings.warning}, info ${s.findings.info})`,
    "",
  );
  if (!options.quiet && report.changes.length > 0) {
    out.push("Changes", ...report.changes.map((c) => changeLine(c, options.verbose === true)), "");
  }
  if (report.findings.length > 0) {
    out.push("Findings", "");
    for (const f of report.findings) {
      out.push(
        `[${f.severity.toUpperCase()}] ${f.path === null ? "(config)" : clean(f.path)}  (${f.ruleId})`,
      );
      out.push(`  ${clean(f.message)}`);
      if (!options.quiet) out.push(`  Next step: ${f.remediation}`);
      out.push("");
    }
  }
  if (s.redacted > 0 || report.changes.some((c) => c.redacted)) {
    out.push("Sensitive values have been redacted.", "");
  }
  out.push(
    report.status === "pass"
      ? "Result: No findings."
      : report.status === "review"
        ? "Result: Review required."
        : `Result: FAILED (findings at or above "${report.failOn}").`,
  );
  return out.join("\n") + "\n";
}
