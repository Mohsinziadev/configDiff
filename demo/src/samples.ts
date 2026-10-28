import { analyzeConfig, parseConfig, type ConfigFormat } from "configdiff-js";

export type Sample = {
  id: string;
  label: string;
  format: ConfigFormat;
  baselineName: string;
  candidateName: string;
  baseline: string;
  candidate: string;
  policy: string;
};

export const SAMPLES: Sample[] = [
  {
    id: "env",
    label: "Staging → production (.env)",
    format: "env",
    baselineName: "staging",
    candidateName: "production",
    baseline: `API_URL=https://staging.example.com
PORT=3000
ENABLE_AUTH=true
JWT_SECRET=staging-secret-value-123
DATABASE_URL=postgres://app:hunter2pass@db.staging.internal/app
OLD_NAME=some-long-shared-value
`,
    candidate: `API_URL=https://staging.example.com/v2
PORT=abc
ENABLE_AUTH=false
JWT_SECRET=prod-secret-value-456
DATABASE_URL=postgres://app:s3cretprodpw@db.prod.internal/app
NEW_NAME=some-long-shared-value
NEXT_PUBLIC_API_SECRET=oops
`,
    policy: `{
  "version": 1,
  "failOn": "error",
  "coerce": { "PORT": "integer" },
  "sensitive": { "keys": ["DATABASE_URL"] },
  "rules": {
    "environment-mismatch": { "baseline": "staging" },
    "required-keys": { "keys": ["DATABASE_URL", "REDIS_URL"] },
    "watch-paths": {
      "paths": [
        { "path": "ENABLE_AUTH", "severity": "error", "message": "Authentication must stay enabled." }
      ]
    }
  }
}`,
  },
  {
    id: "yaml",
    label: "Service config (YAML)",
    format: "yaml",
    baselineName: "values-dev.yaml",
    candidateName: "values-prod.yaml",
    baseline: `replicas: 2
image:
  tag: v1.4.0
  pullPolicy: IfNotPresent
resources:
  limits:
    memory: 512Mi
features:
  - search
  - billing
`,
    candidate: `replicas: "2"
image:
  tag: latest
  pullPolicy: Always
resources:
  limits:
    memory: 256Mi
features:
  - billing
  - search
`,
    policy: `{
  "version": 1,
  "rules": {
    "watch-paths": {
      "paths": [{ "path": "image.tag", "severity": "warning", "message": "Pin an image tag in production." }]
    }
  }
}`,
  },
  {
    id: "json",
    label: "Feature flags (JSON)",
    format: "json",
    baselineName: "flags.before.json",
    candidateName: "flags.after.json",
    baseline: `{
  "checkout": { "enabled": true, "rolloutPercent": 100 },
  "debug": false,
  "apiKey": "sk_live_baseline_000"
}
`,
    candidate: `{
  "checkout": { "enabled": false, "rolloutPercent": 100 },
  "debug": true,
  "apiKey": "sk_live_candidate_111"
}
`,
    policy: `{
  "version": 1,
  "rules": {
    "watch-paths": {
      "paths": [{ "path": "checkout.enabled", "severity": "error", "message": "Checkout must not be switched off." }]
    }
  }
}`,
  },
];

/** What the hero terminal prints: the real report for the first sample, computed with the library itself. */
export const heroReport = (() => {
  const s = SAMPLES[0]!;
  return analyzeConfig({
    baseline: parseConfig(s.baseline, s.format),
    candidate: parseConfig(s.candidate, s.format),
    policy: JSON.parse(s.policy),
  });
})();
