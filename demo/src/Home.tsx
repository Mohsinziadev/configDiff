import { useState, type CSSProperties, type ReactNode } from "react";
import { listRules } from "configdiff";
import { ArrowRight, CheckIcon, CopyIcon, GitHubIcon, Logo } from "./icons";
import {
  CHANGELOG_URL,
  docFile,
  installCommand,
  M2TOOLKIT,
  NPM_URL,
  PACKAGE_MANAGERS,
  PACKAGES_URL,
  PKG,
  RELATED,
  REPO,
  type PackageManager,
} from "./meta";
import { DOC_GROUPS } from "./docs-nav";
import { Playground } from "./Playground";
import { docHref } from "./router";
import { heroReport } from "./samples";
import { Snippet } from "./Snippet";

const RULE_COUNT = listRules().length;

function Install() {
  const [pm, setPm] = useState<PackageManager>("npm");
  const [copied, setCopied] = useState(false);
  const command = installCommand(pm);
  return (
    <div className="install">
      <div className="install-tabs" role="tablist" aria-label="Package manager">
        {PACKAGE_MANAGERS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === pm}
            onClick={() => setPm(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="install-cmd">
        <span className="install-prompt" aria-hidden="true">
          $
        </span>
        <code>{command}</code>
        <button
          type="button"
          className="install-copy"
          aria-label={copied ? "Copied" : `Copy "${command}"`}
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

/** The real report for staging → production, computed with the library when the page is built. */
function ReportCard() {
  const s = heroReport.summary;
  const top = heroReport.findings.filter((f) => f.severity !== "info").slice(0, 4);
  return (
    <div
      className="report"
      role="img"
      aria-label={`ConfigDiff report for staging to production: ${s.added} added, ${s.removed} removed, ${s.modified} modified, ${s.findings.error} errors and ${s.findings.warning} warnings. The build fails.`}
    >
      <div className="report-bar" aria-hidden="true">
        <span className="report-dot" />
        <em>configdiff compare .env.staging .env.production</em>
      </div>
      <div className="report-body" aria-hidden="true">
        <div className="report-sum">
          <span className="add">+{s.added}</span>
          <span className="del">−{s.removed}</span>
          <span className="mod">~{s.modified}</span>
          <span className="sep" />
          <span className="red">{s.redacted} values redacted</span>
        </div>
        {top.map((f, i) => (
          <div key={i} className="report-row">
            <span className={`sev sev-${f.severity}`}>{f.severity}</span>
            <span className="report-path">{f.path}</span>
            <span className="report-rule">{f.ruleId}</span>
            <span className="report-msg">{f.message}</span>
          </div>
        ))}
        <div className="report-foot">
          <span className="sev sev-error">failed</span>
          <span>
            {s.findings.error} errors · {s.findings.warning} warnings · exit code 1
          </span>
        </div>
      </div>
    </div>
  );
}

const FEATURES: { title: string; body: ReactNode; visual: ReactNode }[] = [
  {
    title: "Structure, not text",
    body: (
      <>
        Key order, whitespace and comments never show up as changes. A reordered array, or{" "}
        <code>3000</code> turning into <code>"3000"</code>, does. Normalization such as{" "}
        <code>unordered</code>, <code>trim</code> and <code>coerce</code> is opt-in.
      </>
    ),
    visual: <Snippet name="structural.ts" />,
  },
  {
    title: "Risk-aware findings",
    body: (
      <>
        {RULE_COUNT} documented rules, each with a stable id, a remediation and its known false
        positives: authentication switched off, staging values in production, secrets in public
        variables.
      </>
    ),
    visual: <Snippet name="findings.txt" />,
  },
  {
    title: "Secrets stay out",
    body: (
      <>
        Redaction happens when changes are built, not when they are printed. Public objects hold{" "}
        <code>redacted: true</code> instead of the value, so text, JSON and error paths cannot leak
        what they never received.
      </>
    ),
    visual: <Snippet name="redaction.json" />,
  },
  {
    title: "Policy as a file",
    body: (
      <>
        Required keys, forbidden values, watched paths, coercions and severity overrides live in one
        reviewable <code>configdiff.policy.json</code>. It is data, never code, and unknown keys are
        errors.
      </>
    ),
    visual: <Snippet name="policy.json" />,
  },
  {
    title: "Built for CI",
    body: (
      <>
        Exit code <code>0</code>, <code>1</code> or <code>2</code>, a <code>--fail-on</code>{" "}
        threshold, JSON output, and plain text with severities spelled out, so the log is safe to
        read and safe to share.
      </>
    ),
    visual: <Snippet name="ci.yaml" />,
  },
  {
    title: "Validate a single config",
    body: (
      <>
        Check one file against a built-in schema or any Standard Schema validator such as Zod,
        Valibot or ArkType. Messages from third-party validators are scrubbed of sensitive values.
      </>
    ),
    visual: (
      <>
        <Snippet name="schema.ts" />
        <ul className="chips" aria-label="Schema sources">
          {["Built-in schema", "Standard Schema", "Zod · Valibot · ArkType"].map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </>
    ),
  },
];

const STATS = [
  { value: String(RULE_COUNT), label: "Documented rules" },
  { value: "4", label: "Formats: env, JSON, YAML, TOML" },
  { value: "2", label: "Runtime dependencies" },
  { value: "0", label: "Network calls, ever" },
];

const COMPARE: { row: string; cells: string[] }[] = [
  {
    row: "Best at",
    cells: [
      "Config across environments",
      "Raw object diff",
      ".env vs .env.example",
      "Validating process.env",
    ],
  },
  { row: "Compares two configs", cells: ["yes", "yes (objects)", "yes (env files)", "no"] },
  {
    row: "Reads env, JSON, YAML, TOML",
    cells: ["yes", "you parse first", "env files", "env only"],
  },
  { row: "Risk rules and policy file", cells: ["yes", "–", "–", "schema only"] },
  { row: "Redacted, CI-safe reports", cells: ["yes", "–", "–", "–"] },
  { row: "100k leaves, compared", cells: ["about 0.3 s", "10–100× faster", "–", "–"] },
];

export function Home() {
  return (
    <main id="main" tabIndex={-1} className="home-view">
      <div className="frame">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              by <a href={PACKAGES_URL}>M2Toolkit</a> <span className="eyebrow-sep">/</span> v
              {PKG.version} <span className="eyebrow-sep">/</span> Framework-agnostic{" "}
              <span className="eyebrow-sep">/</span> Node.js 22.12+
            </p>
            <h1 className="hero-title">Catch the config change that takes prod down.</h1>
            <p className="hero-tagline">
              Structural comparison of env, JSON, YAML and TOML, with risk-aware findings, policy
              enforcement and built-in secret redaction. Works offline.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref("getting-started")}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Try the playground
              </a>
              <a className="btn" href={REPO} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <Install />
          </div>
          <div className="hero-art">
            <ReportCard />
          </div>
        </section>

        <section className="why" aria-labelledby="why-title">
          <div>
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Why ConfigDiff
            </p>
            <h2 id="why-title" className="section-title">
              A text diff shows what moved.
              <br />
              It can’t tell you what matters.
            </h2>
            <a className="btn" href={docHref("concepts")}>
              Learn more
            </a>
          </div>
          <div className="why-copy">
            <p>
              A diff cannot tell you that key order changed but nothing else did, that an array was
              reordered, that <code>3000</code> became <code>"3000"</code>, which change is
              dangerous, or whether pasting the result into CI logs leaks a password.
            </p>
            <p>
              ConfigDiff compares structure, explains each change, flags the risky ones with
              documented rules, and keeps secrets out of every report. It parses your config but
              never executes it. Use it as a CLI or as a library.
            </p>
            <Snippet name="hero.ts" />
          </div>
        </section>

        <section className="statement">
          <h2 className="statement-title">Compare. Flag. Redact.</h2>
        </section>

        <section className="features" id="features" aria-label="Features">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="feature">
              <span className="feature-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="feature-visual">{f.visual}</div>
            </article>
          ))}
        </section>
        <div className="features-more">
          <a className="btn" href={docHref("policy")}>
            Read the guide
          </a>
        </div>

        <Playground />

        <section className="stats" aria-label="ConfigDiff in numbers">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <section className="compare" id="compare" aria-labelledby="compare-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Comparison
            </p>
            <h2 id="compare-title" className="section-title">
              Where it fits next to the tools you already use.
            </h2>
            <p className="section-lead">
              The others are better at what they target; “–” means it is not what the tool is for.
              Offline by design, ConfigDiff is meant to sit beside them, not replace them.{" "}
              <a href={docHref("comparison")}>Read the full comparison</a>.
            </p>
          </div>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col" className="compare-us">
                    ConfigDiff
                  </th>
                  <th scope="col">microdiff / deep-diff</th>
                  <th scope="col">dotenv-diff</th>
                  <th scope="col">envalid / T3 Env</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={i === 0 ? "compare-us" : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="docs-index" id="documentation" aria-labelledby="docs-index-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Documentation
            </p>
            <h2 id="docs-index-title" className="section-title">
              From your first diff to a gated pull request.
            </h2>
          </div>
          <div className="docs-index-groups">
            {DOC_GROUPS.map((g) => (
              <div key={g.title} className="docs-index-group">
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((d) => (
                    <li key={d.slug}>
                      <a href={docHref(d.slug)}>
                        <span className="docs-index-title">
                          {d.title} <ArrowRight width={14} height={14} />
                        </span>
                        <span className="docs-index-blurb">{d.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="related" aria-labelledby="related-title">
          <div className="section-head">
            <p className="eyebrow">m2toolkit</p>
            <h2 id="related-title" className="section-title">
              More open-source packages from M2Toolkit.
            </h2>
          </div>
          <ul className="related-list">
            {RELATED.map((p) => (
              <li key={p.slug}>
                <a href={p.url} style={{ "--accent": p.accent } as CSSProperties}>
                  <span className="related-dot" aria-hidden="true" />
                  <span className="related-title">{p.title}</span>
                  <span className="related-tag">{p.tagline}</span>
                  <span className="related-go">
                    /npm-packages/{p.slug} <ArrowRight width={14} height={14} />
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a href={PACKAGES_URL} className="related-all">
                <span className="related-title">All npm packages</span>
                <span className="related-tag">Every package we publish, with live previews.</span>
                <span className="related-go">
                  browse all <ArrowRight width={14} height={14} />
                </span>
              </a>
            </li>
          </ul>
        </section>

        <section className="cta">
          <div className="cta-card">
            <h2>Review config changes like you review code</h2>
            <p>
              One command in CI, one policy file in the repo, and no secret ever lands in a log.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref("getting-started")}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Open the playground
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>{PKG.description}</p>
          </div>
          <div>
            <h3>Docs</h3>
            <a href={docHref("getting-started")}>Getting Started</a>
            <a href={docHref("cli")}>CLI</a>
            <a href={docHref("policy")}>Policy</a>
            <a href={docHref("rules")}>Rules</a>
            <a href={docHref("api")}>API Reference</a>
          </div>
          <div>
            <h3>Resources</h3>
            <a href={REPO} target="_blank" rel="noreferrer">
              <GitHubIcon width={14} height={14} /> GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={docFile("SECURITY.md")} target="_blank" rel="noreferrer">
              Security policy
            </a>
          </div>
          <div>
            <h3>M2Toolkit</h3>
            <a href={M2TOOLKIT}>Home</a>
            <a href={`${M2TOOLKIT}/tools`}>Free tools</a>
            <a href={PACKAGES_URL}>npm packages</a>
            <a href={`${M2TOOLKIT}/about`}>About</a>
          </div>
        </div>
        <p className="footer-bottom">
          Released under the {PKG.license} License. © 2026 Mohsin Zia. Hosted on{" "}
          <a href={PACKAGES_URL}>m2toolkit.com/npm-packages</a>.
        </p>
      </footer>
    </main>
  );
}
