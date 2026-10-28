// Benchmarks the structural engine only (no parsing, no file I/O).
// Baselines: microdiff and deep-diff on identical in-memory inputs.
// Semantics differ: ConfigDiff additionally normalizes, applies redaction, and builds a report model;
// the others only produce a raw diff. Read docs/BENCHMARKS.md before drawing conclusions.
import os from "node:os";
import { performance } from "node:perf_hooks";
import microdiff from "microdiff";
import deepDiff from "deep-diff";
import { compareConfigs } from "../dist/index.js";

function makeTree(width, depth, seed = 0) {
  if (depth === 0) return seed % 3 === 0 ? `v${seed}` : seed % 3 === 1 ? seed : seed % 2 === 0;
  const o = {};
  for (let i = 0; i < width; i++) o[`k${i}`] = makeTree(width, depth - 1, seed * width + i + 1);
  return o;
}
function mutate(tree, every) {
  let n = 0;
  const walk = (v) => {
    if (v !== null && typeof v === "object") {
      for (const k of Object.keys(v)) {
        if (v[k] !== null && typeof v[k] === "object") walk(v[k]);
        else if (++n % every === 0) v[k] = typeof v[k] === "number" ? v[k] + 1 : `${v[k]}x`;
      }
    }
  };
  walk(tree);
  return tree;
}
const countLeaves = (v) =>
  v !== null && typeof v === "object"
    ? Object.values(v).reduce((s, x) => s + countLeaves(x), 0)
    : 1;

const flatEnv = (n) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`VAR_${i}`, `value-${i}`]));
const workloads = [];
{
  const a = flatEnv(20);
  const b = { ...a, VAR_3: "changed", VAR_20: "new" };
  delete b.VAR_5;
  workloads.push(["small env (20 keys)", a, b, 20000, 2000]);
}
{
  const a = makeTree(5, 4); // 625 leaves
  workloads.push([
    "medium JSON (~625 leaves, 10% changed)",
    a,
    mutate(structuredClone(a), 10),
    2000,
    200,
  ]);
}
{
  const a = makeTree(10, 5); // 100k leaves
  workloads.push([
    "large nested (~100k leaves, 1% changed)",
    a,
    mutate(structuredClone(a), 100),
    15,
    3,
  ]);
}
{
  const a = { items: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `n${i}` })) };
  const b = structuredClone(a);
  b.items.reverse();
  workloads.push(["ordered array of 5000 objects (reversed)", a, b, 50, 5]);
}
{
  const a = flatEnv(5000);
  const b = flatEnv(5000);
  for (let i = 0; i < 2500; i++) {
    delete a[`VAR_${i}`];
    b[`NEW_${i}`] = `n${i}`;
  }
  workloads.push(["many added/removed (2500 + 2500 of 5000)", a, b, 40, 5]);
}
{
  const deep = (d) => (d === 0 ? { leaf: "x" } : { n: deep(d - 1) });
  const a = deep(150);
  const b = deep(150);
  let p = b;
  while (p.n) p = p.n;
  p.leaf = "y";
  workloads.push(["deeply nested (150 levels, 1 change)", a, b, 5000, 500]);
}

function measure(fn, iterations, warmup) {
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  times.sort((x, y) => x - y);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  return { median: q(0.5), p25: q(0.25), p75: q(0.75) };
}

const fmt = (m) =>
  `${m.median.toFixed(m.median < 1 ? 4 : 2)} ms (IQR ${m.p25.toFixed(m.p25 < 1 ? 4 : 2)}–${m.p75.toFixed(m.p75 < 1 ? 4 : 2)})`;
const heap = () => {
  global.gc?.();
  return process.memoryUsage().heapUsed;
};

console.log(
  `Node ${process.version} | ${os.type()} ${os.release()} ${os.arch()} | ${os.cpus()[0]?.model} x${os.cpus().length}`,
);
console.log("");
console.log(
  "| Workload | ConfigDiff (default) | ConfigDiff (builtin redaction off) | microdiff | deep-diff | changes (CD / micro / deep) |",
);
console.log("|---|---|---|---|---|---|");
for (const [name, a, b, iters, warm] of workloads) {
  const cd = measure(() => compareConfigs(a, b), iters, warm);
  const cdNo = measure(() => compareConfigs(a, b, { sensitive: { builtin: false } }), iters, warm);
  const md = measure(() => microdiff(a, b), iters, warm);
  const dd = measure(() => deepDiff.diff(a, b), iters, warm);
  const counts = `${compareConfigs(a, b).changes.length} / ${microdiff(a, b).length} / ${(deepDiff.diff(a, b) ?? []).length}`;
  console.log(
    `| ${name} [${countLeaves(a)} leaves, n=${iters}, warmup=${warm}] | ${fmt(cd)} | ${fmt(cdNo)} | ${fmt(md)} | ${fmt(dd)} | ${counts} |`,
  );
}
void heap;
