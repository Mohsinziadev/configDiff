#!/usr/bin/env node
import { runCli } from "./cli.js";

// A closed pipe (for example `configdiff ... | head`) is not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw err;
});

const result = await runCli(process.argv.slice(2));
if (result.stderr) process.stderr.write(result.stderr);
if (result.stdout) process.stdout.write(result.stdout);
process.exitCode = result.exitCode;
