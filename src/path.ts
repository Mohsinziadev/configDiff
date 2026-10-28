import { ConfigDiffError } from "./errors.js";
import type { PathSegment } from "./types.js";

export function formatPath(path: readonly PathSegment[]): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out === "" ? seg : `.${seg}`;
  }
  return out;
}

export function comparePaths(a: readonly PathSegment[], b: readonly PathSegment[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as PathSegment;
    const y = b[i] as PathSegment;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Compile a path glob into a predicate over formatted paths.
 * `*` matches within one segment, `**` matches across segments, `[*]` matches any index.
 */
export function compilePathGlob(glob: string, flags = ""): (path: string) => boolean {
  let src = "";
  for (let i = 0; i < glob.length;) {
    if (glob.startsWith("**", i)) {
      src += ".*";
      i += 2;
    } else if (glob.startsWith("[*]", i)) {
      src += "\\[\\d+\\]";
      i += 3;
    } else if (glob[i] === "*") {
      src += "[^.\\[\\]]*";
      i += 1;
    } else {
      src += escapeRe(glob[i] as string);
      i += 1;
    }
  }
  const re = new RegExp(`^${src}$`, flags);
  return (path) => re.test(path);
}

export function compileGlobs(globs: readonly string[] | undefined): (path: string) => boolean {
  if (!globs || globs.length === 0) return () => false;
  const fns = globs.map((g) => compilePathGlob(g));
  return (p) => fns.some((f) => f(p));
}

/** Compile user-supplied regex source with a length guard. */
export function compileUserRegex(source: string, flags: string, what: string): RegExp {
  if (source.length > 500) {
    throw new ConfigDiffError("INVALID_OPTIONS", `${what}: pattern is longer than 500 characters`);
  }
  try {
    return new RegExp(source, flags);
  } catch {
    throw new ConfigDiffError("INVALID_OPTIONS", `${what}: invalid regular expression`);
  }
}
