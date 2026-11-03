#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runCli } from "./check.js";
export { runCli } from "./check.js";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().then(exitCode => { process.exitCode = exitCode; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
