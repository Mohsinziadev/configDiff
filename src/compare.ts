import { canonical, normalizeConfig, type Leaf, type Normalized } from "./normalize.js";
import { comparePaths } from "./path.js";
import { Redactor, Scrubber } from "./redact.js";
import type { Change, CompareOptions, ValueView } from "./types.js";

/** Internal pairing of a public change with the raw leaves. Never leaves the library. */
export interface Entry {
  change: Change;
  base: Leaf | undefined;
  cand: Leaf | undefined;
  sensitive: boolean;
}

export interface Comparison {
  entries: Entry[];
  baseNorm: Normalized | undefined;
  candNorm: Normalized;
  redactor: Redactor;
  scrubber: Scrubber;
}

const PREVIEW_MAX = 80;

export function show(view: ValueView): string {
  if (!view.present) return "(absent)";
  if (view.redacted) return "[REDACTED]";
  const s = JSON.stringify(view.value) ?? "null";
  return s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX)}…` : s;
}

export function toView(leaf: Leaf | undefined, redacted: boolean): ValueView {
  if (!leaf) return { present: false };
  if (redacted) return { present: true, type: leaf.type, redacted: true };
  return { present: true, type: leaf.type, redacted: false, value: structuredClone(leaf.value) };
}

function multisetDelta(a: unknown[], b: unknown[]): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const x of a) counts.set(canonical(x), (counts.get(canonical(x)) ?? 0) + 1);
  let added = 0;
  for (const x of b) {
    const k = canonical(x);
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of counts.values()) removed += n;
  return { added, removed };
}

function sameLeaf(
  a: Leaf,
  b: Leaf,
  unorderedArray: boolean,
): { same: boolean; delta?: { added: number; removed: number } } {
  if (a.type !== b.type) return { same: false };
  if (a.type === "array" && unorderedArray) {
    const delta = multisetDelta(a.value as unknown[], b.value as unknown[]);
    return { same: delta.added === 0 && delta.removed === 0, delta };
  }
  if (a.type === "array" || a.type === "object")
    return { same: canonical(a.value) === canonical(b.value) };
  return { same: Object.is(a.value, b.value) };
}

const isEmptyContainer = (l: Leaf): boolean =>
  (Array.isArray(l.value) && l.value.length === 0) ||
  (l.type === "object" && Object.keys(l.value as object).length === 0);

/** JSON keys of every proper ancestor path of every leaf. */
function parentKeys(norm: Normalized): Set<string> {
  const out = new Set<string>();
  for (const l of norm.leaves.values()) {
    for (let n = 1; n < l.segments.length; n++) out.add(JSON.stringify(l.segments.slice(0, n)));
  }
  return out;
}

/**
 * Compare two configurations. `baseline` undefined means single-config (check) mode:
 * every candidate leaf is treated as present with no changes.
 */
export function runComparison(
  baseline: unknown,
  candidate: unknown,
  options: CompareOptions,
  hasBaseline = true,
): Comparison {
  const redactor = new Redactor(options.sensitive);
  const scrubber = new Scrubber();
  const baseNorm = hasBaseline ? normalizeConfig(baseline, options) : undefined;
  const candNorm = normalizeConfig(candidate, options);
  const entries: Entry[] = [];

  // Register every sensitive raw value so free text can be scrubbed as a last defence.
  for (const norm of [baseNorm, candNorm]) {
    for (const leaf of norm?.leaves.values() ?? []) {
      if (redactor.isSensitive(leaf.segments, leaf.value)) scrubber.add(leaf.value);
    }
  }

  if (baseNorm) {
    const keys = new Set([...baseNorm.leaves.keys(), ...candNorm.leaves.keys()]);
    const baseParents = parentKeys(baseNorm);
    const candParents = parentKeys(candNorm);
    for (const key of keys) {
      const base = baseNorm.leaves.get(key);
      const cand = candNorm.leaves.get(key);
      const ref = (base ?? cand) as Leaf;
      // An empty container that gained or lost children is described by those children.
      if (base && !cand && isEmptyContainer(base) && candParents.has(key)) continue;
      if (cand && !base && isEmptyContainer(cand) && baseParents.has(key)) continue;
      let type: Change["type"];
      let delta: { added: number; removed: number } | undefined;
      if (!base) type = "added";
      else if (!cand) type = "removed";
      else {
        const unordered = (options.unordered ?? []).length > 0 && base.type === "array";
        const cmp = sameLeaf(base, cand, unordered);
        if (cmp.same) continue;
        type = "modified";
        delta = cmp.delta;
      }
      const sensitive = redactor.isSensitive(ref.segments, base?.value, cand?.value);
      const baseView = toView(base, sensitive);
      const candView = toView(cand, sensitive);
      const typeChanged = !!base && !!cand && base.type !== cand.type;
      let explanation: string;
      if (type === "added") explanation = "Present in candidate, absent in baseline.";
      else if (type === "removed") explanation = "Present in baseline, absent in candidate.";
      else if (typeChanged) explanation = `Type changed from ${base?.type} to ${cand?.type}.`;
      else if (delta)
        explanation = `Array contents differ (${delta.added} added, ${delta.removed} removed).`;
      else if (sensitive) explanation = "Value changed (values hidden).";
      else explanation = `Value changed from ${show(baseView)} to ${show(candView)}.`;
      const change: Change = {
        type,
        path: ref.path || "(root)",
        pathSegments: [...ref.segments],
        baseline: baseView,
        candidate: candView,
        typeChanged,
        redacted: sensitive,
        ruleIds: [],
        explanation,
        ...(delta ? { arrayDelta: delta } : {}),
      };
      entries.push({ change, base, cand, sensitive });
    }
    entries.sort((a, b) => comparePaths(a.change.pathSegments, b.change.pathSegments));
  }
  return { entries, baseNorm, candNorm, redactor, scrubber };
}
