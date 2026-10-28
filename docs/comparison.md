# Comparison

Other tools are better at what they target. Use them together where it makes sense.

| Need                                                                         | Better choice                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| Runtime validation of `process.env` with types                               | envalid, T3 Env, env-schema                              |
| `.env` vs `.env.example`, unused or missing variables found by scanning code | [dotenv-diff](https://www.npmjs.com/package/dotenv-diff) |
| Encrypting env files                                                         | dotenvx                                                  |
| Raw object diff inside a library                                             | microdiff, deep-diff                                     |
| Nested JSON, YAML and TOML across environments, with policy and safe reports | **ConfigDiff**                                           |

## Speed

Raw diff libraries are 10 to 100 times faster on the same inputs, because ConfigDiff also normalizes, redacts and builds a report model. 100k leaves take about 0.3 s. Do not choose ConfigDiff for speed. See [Benchmarks](benchmarks.md).
