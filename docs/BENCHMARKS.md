# Benchmarks

Reproduce with `npm run benchmark`. Results below are from one run; they will vary by machine.

- **Environment:** Node v22.23.1, Darwin 27.0.0 arm64, Apple M4 (10 cores).
- **Scope:** `compareConfigs` only. No parsing, no file I/O.
- **Method:** in-memory inputs shared by all tools; per-workload warm-up iterations discarded, then n timed iterations with `performance.now()`; median and interquartile range reported. Memory was not measured.
- **Baselines:** `microdiff` 1.6.0 and `deep-diff` 1.0.2. The change counts in the last column match across tools for every workload, so they are reporting the same differences. Semantics are _not_ otherwise equivalent: ConfigDiff also formats paths, normalizes strings, runs redaction heuristics on every leaf, clones values into public views and sorts results. The libraries return raw diff records.

| Workload                                      | ConfigDiff (default) | ConfigDiff (builtin redaction off) | microdiff | deep-diff | changes (CD / micro / deep) |
| --------------------------------------------- | -------------------- | ---------------------------------- | --------- | --------- | --------------------------- |
| small env (20 keys), n=20000                  | 0.0181 ms            | 0.0120 ms                          | 0.0007 ms | 0.0020 ms | 3 / 3 / 3                   |
| medium JSON (625 leaves, 10% changed), n=2000 | 1.43 ms              | 0.77 ms                            | 0.0275 ms | 0.0678 ms | 62 / 62 / 62                |
| large nested (100k leaves, 1% changed), n=15  | 330.81 ms            | 196.91 ms                          | 3.08 ms   | 6.67 ms   | 1000 / 1000 / 1000          |
| ordered array of 5000 objects, reversed, n=50 | 30.64 ms             | 22.39 ms                           | 1.07 ms   | 3.73 ms   | 10000 / 10000 / 10000       |
| 2500 added + 2500 removed of 5000, n=40       | 8.43 ms              | 6.28 ms                            | 0.70 ms   | 8.35 ms   | 5000 / 5000 / 5000          |
| 150 levels deep, 1 change, n=5000             | 0.68 ms              | 0.63 ms                            | 0.016 ms  | 0.041 ms  | 1 / 1 / 1                   |

(Medians; IQRs are tight, see `npm run benchmark` output.)

## Reading the results

- ConfigDiff is roughly 15–100× slower than the raw diff libraries on these inputs and is **not** faster than any of them. Absolute cost is small for real config sizes (tens of keys: ~0.02 ms; 100k leaves: ~0.3 s).
- Redaction heuristics account for roughly 30–45% of the time.
- Known bottlenecks: per-leaf path-array copies (quadratic in depth), per-leaf regex checks, `structuredClone` of values into views. Not optimized in 0.1 because correctness and safety were prioritized.
- Not benchmarked: parsers, file I/O, large collections of files, unordered-array comparison, memory.
