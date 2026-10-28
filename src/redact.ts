import { compilePathGlob, compileUserRegex, formatPath } from "./path.js";
import type { PathSegment, SensitiveOptions } from "./types.js";

/** Conservative key-name patterns. A name match is a signal, not proof. */
const BUILTIN_KEY_PATTERNS: RegExp[] = [
  /secret/i,
  /passw(or)?d/i,
  /passphrase/i,
  /token/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /credential/i,
  /access[_-]?key/i,
  /signing[_-]?key/i,
  /encryption[_-]?key/i,
  /connection[_-]?string/i,
  /bearer/i,
  /(^|[_-])key$/i,
  /(^|[_-])dsn$/i,
];

/** High-precision value shapes. Heuristic; will not catch every secret. */
const VALUE_PATTERNS: RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, // credentials embedded in a URL
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/, // JWT
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, // GitHub token
  /\bsk_(live|test)_[A-Za-z0-9]{16,}/, // Stripe-style secret key
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack token
];

const CREDENTIAL_URL = VALUE_PATTERNS[0] as RegExp;

export function hasCredentialUrl(value: unknown): boolean {
  return typeof value === "string" && CREDENTIAL_URL.test(value);
}

function containsSensitiveShape(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return VALUE_PATTERNS.some((re) => re.test(value));
  if (depth > 50 || value === null || typeof value !== "object") return false;
  for (const v of Object.values(value)) if (containsSensitiveShape(v, depth + 1)) return true;
  return false;
}

export class Redactor {
  private readonly keyGlobs: Array<(p: string) => boolean>;
  private readonly patterns: RegExp[];
  private readonly redactAll: boolean;

  constructor(options: SensitiveOptions = {}) {
    this.redactAll = options.redactAll === true;
    this.keyGlobs = (options.keys ?? []).map((k) => compilePathGlob(k, "i"));
    this.patterns = [
      ...(options.builtin === false ? [] : BUILTIN_KEY_PATTERNS),
      ...(options.patterns ?? []).map((p) => compileUserRegex(p, "i", "sensitive.patterns")),
    ];
  }

  /** Name-based: the path, or any of its segments, looks sensitive. */
  isSensitiveKey(path: readonly PathSegment[]): boolean {
    if (this.redactAll) return true;
    const full = formatPath(path);
    if (this.keyGlobs.some((g) => g(full))) return true;
    for (const seg of path) {
      if (typeof seg !== "string") continue;
      if (this.keyGlobs.some((g) => g(seg))) return true;
      if (this.patterns.some((re) => re.test(seg))) return true;
    }
    return false;
  }

  /** Shape-based: the value itself looks like a credential. */
  isSensitiveValue(value: unknown): boolean {
    return containsSensitiveShape(value);
  }

  isSensitive(path: readonly PathSegment[], ...values: unknown[]): boolean {
    return this.isSensitiveKey(path) || values.some((v) => this.isSensitiveValue(v));
  }
}

/** Last-resort defence: replace known sensitive strings in free text. */
export class Scrubber {
  private readonly needles = new Set<string>();

  add(value: unknown): void {
    if (typeof value === "string" && value.length >= 4) this.needles.add(value);
    else if (typeof value === "number") {
      const s = String(value);
      if (s.length >= 4) this.needles.add(s);
    } else if (value !== null && typeof value === "object") {
      for (const v of Object.values(value)) this.add(v);
    }
  }

  scrub(text: string): string {
    let out = text;
    // longest first so a substring needle cannot expose the rest of a longer one
    for (const n of [...this.needles].sort((a, b) => b.length - a.length)) {
      if (out.includes(n)) out = out.split(n).join("[REDACTED]");
    }
    return out;
  }
}
