import { useMemo, useState } from "react";
import { analyzeConfig, parseConfig, type Report, type ValueView } from "configdiff-js";
import { docHref } from "./router";
import { SAMPLES, type Sample } from "./samples";

type Outcome = { ok: true; report: Report } | { ok: false; message: string };

function run(
  format: Sample["format"],
  baseline: string,
  candidate: string,
  policy: string,
): Outcome {
  try {
    return {
      ok: true,
      report: analyzeConfig({
        baseline: parseConfig(baseline, format),
        candidate: parseConfig(candidate, format),
        policy: policy.trim() ? JSON.parse(policy) : {},
      }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

const STATUS: Record<Report["status"], string> = {
  pass: "✓ No findings",
  review: "! Review required",
  fail: "✗ Failed",
};

const show = (v: ValueView) =>
  !v.present ? "(absent)" : v.redacted ? "[REDACTED]" : (JSON.stringify(v.value) ?? "null");

const NOTES: Record<Sample["id"], { text: string; link: string }> = {
  env: {
    text: "Secrets are redacted even though they changed, authentication switched off is an error, and PORT=abc fails its integer coercion. Edit the policy to turn rules on or off.",
    link: "policy",
  },
  yaml: {
    text: "Quoting a number changes its type, and a reordered list counts as changes until you declare it unordered. The policy watches image.tag.",
    link: "concepts",
  },
  json: {
    text: "The API key is redacted on both sides. The policy escalates one flag to an error; everything else is only listed as a change.",
    link: "rules",
  },
};

export function Playground() {
  const [id, setId] = useState<Sample["id"]>(SAMPLES[0]!.id);
  const sample = SAMPLES.find((s) => s.id === id)!;
  const [text, setText] = useState(() =>
    Object.fromEntries(
      SAMPLES.map((s) => [
        s.id,
        { baseline: s.baseline, candidate: s.candidate, policy: s.policy },
      ]),
    ),
  );
  const current = text[id]!;
  const set = (key: "baseline" | "candidate" | "policy", value: string) =>
    setText((all) => ({ ...all, [id]: { ...all[id]!, [key]: value } }));
  const outcome = useMemo(
    () => run(sample.format, current.baseline, current.candidate, current.policy),
    [sample.format, current],
  );
  const note = NOTES[id]!;

  return (
    <section className="playground" id="playground" aria-labelledby="playground-title">
      <div className="section-head">
        <p className="eyebrow eyebrow-brand">Playground</p>
        <h2 id="playground-title" className="section-title">
          Paste two configs. See what a diff would miss.
        </h2>
        <p className="section-lead">
          Everything below runs in your browser on the same ConfigDiff source this page documents.
          Your text never leaves the page.
        </p>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Example">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === id}
            onClick={() => setId(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        {(
          [
            ["baseline", "Baseline", sample.baselineName],
            ["candidate", "Candidate", sample.candidateName],
            ["policy", "Policy", "configdiff.policy.json"],
          ] as const
        ).map(([key, title, file]) => (
          <div key={key} className="pg-panel">
            <div className="pg-head">
              <span>{title}</span>
              <span className="pg-file">{file}</span>
            </div>
            <textarea
              className="pg-editor"
              value={current[key]}
              onChange={(e) => set(key, e.target.value)}
              spellCheck={false}
              rows={10}
              aria-label={`${title} (${file})`}
            />
          </div>
        ))}
      </div>

      <div className="pg-panel pg-result" aria-live="polite">
        <div className="pg-head">
          {outcome.ok ? (
            <span className={`pg-status pg-${outcome.report.status}`}>
              {STATUS[outcome.report.status]}
            </span>
          ) : (
            <span className="pg-status pg-fail">✗ Error</span>
          )}
          {outcome.ok && (
            <span className="pg-file">
              {outcome.report.summary.added} added · {outcome.report.summary.removed} removed ·{" "}
              {outcome.report.summary.modified} modified · {outcome.report.summary.redacted}{" "}
              redacted
            </span>
          )}
          <button
            type="button"
            className="pg-reset"
            onClick={() =>
              setText((all) => ({
                ...all,
                [id]: {
                  baseline: sample.baseline,
                  candidate: sample.candidate,
                  policy: sample.policy,
                },
              }))
            }
          >
            Reset
          </button>
        </div>
        {outcome.ok ? (
          <div className="pg-cols">
            <div>
              <h3>Findings ({outcome.report.findings.length})</h3>
              {outcome.report.findings.length === 0 ? (
                <p className="pg-empty">Nothing to flag.</p>
              ) : (
                <ul className="pg-findings">
                  {outcome.report.findings.map((f, i) => (
                    <li key={i}>
                      <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                      <code>{f.path ?? "(config)"}</code>
                      <small>{f.ruleId}</small>
                      <p>{f.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Changes ({outcome.report.changes.length})</h3>
              <ul className="pg-changes">
                {outcome.report.changes.map((c, i) => (
                  <li key={i} className={`chg-${c.type}`}>
                    <b aria-label={c.type}>
                      {c.type === "added" ? "+" : c.type === "removed" ? "−" : "~"}
                    </b>
                    <code>{c.path}</code>
                    <span>
                      {c.type === "added"
                        ? show(c.candidate)
                        : c.type === "removed"
                          ? show(c.baseline)
                          : `${show(c.baseline)} → ${show(c.candidate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="pg-body">
            <p className="pg-error">{outcome.message}</p>
          </div>
        )}
      </div>
      <p className="pg-note">
        {note.text} <a href={docHref(note.link)}>Read more →</a>
      </p>
    </section>
  );
}
