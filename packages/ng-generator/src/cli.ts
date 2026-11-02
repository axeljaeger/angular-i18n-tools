#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { logging } from "@angular-devkit/core";
import { NodeWorkflow } from "@angular-devkit/schematics/tools/index.js";
import { parse as parseJson } from "jsonc-parser";

export function workspaceRoot(start: string): string {
  let root = resolve(start);
  while (!existsSync(join(root, "nx.json")) && !existsSync(join(root, "angular.json"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error("Run setup inside an Angular CLI or Nx workspace.");
    root = parent;
  }
  return root;
}

export async function runCli(args: string[], cwd = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    project: { type: "string", multiple: true },
    all: { type: "boolean", default: false },
    locales: { type: "string", multiple: true },
    "source-locale": { type: "string" },
    "query-param": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "skip-install": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" }
  } });
  if (values.help) {
    console.log("Angular i18n Tools setup\n\n  npx @angular-i18n-tools/ng-generator\n  npx @angular-i18n-tools/ng-generator storybook\n\nRun inside an Angular CLI or Nx workspace. Select Angular projects with Space;\npress A to toggle all, and Enter to apply. Storybook setup requires an existing\nAngular Storybook.\n\nOptions: --project app1,app2  --all  --dry-run  --skip-install  --version");
    return;
  }
  if (values.version) {
    console.log((parseJson(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version);
    return;
  }
  const command = positionals[0] ?? "setup";
  if (positionals.length > 1 || !["setup", "storybook"].includes(command)) throw new Error("Use setup or storybook. Run with --help for available options.");
  const root = workspaceRoot(cwd);
  const pkgPath = join(root, "package.json");
  const pkg = existsSync(pkgPath) ? parseJson(readFileSync(pkgPath, "utf8")) as { packageManager?: string } : {};
  const packageManager = pkg.packageManager?.split("@")[0] || (existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : "npm");
  const workflow = new NodeWorkflow(root, { dryRun: values["dry-run"], packageManager, schemaValidation: true, resolvePaths: [root] });
  const logger = new logging.Logger("angular-i18n-setup");
  logger.subscribe(entry => console.log(entry.message));
  workflow.reporter.subscribe(event => {
    if (event.kind === "create" || event.kind === "update") console.log(`${values["dry-run"] ? "DRY RUN " : ""}${event.kind.toUpperCase()} ${event.path}`);
  });
  await new Promise<void>((complete, error) => workflow.execute({
    collection: fileURLToPath(new URL("../collection.json", import.meta.url)),
    schematic: command === "storybook" ? "storybook-localize" : "runtime-localize",
    options: { projects: values.project ?? [], all: values.all, skipInstall: values["skip-install"],
      locales: values.locales?.flatMap(value => value.split(",")) ?? [],
      ...(values["source-locale"] ? { sourceLocale: values["source-locale"] } : {}),
      ...(values["query-param"] ? { queryParam: values["query-param"] } : {})
    },
    logger
  }).subscribe({ complete, error }));
  console.log(values["dry-run"] ? "Preview complete. No files changed." : "Setup complete.");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof Error && ["ExitPromptError", "AbortPromptError"].includes(error.name)) {
      console.log("Setup cancelled. No files changed.");
      process.exitCode = 130;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
}
