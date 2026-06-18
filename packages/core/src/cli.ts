#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCatalog, getCatalogDiagnostics, isIgnoredWorkspacePath, type WorkspaceFile } from "./index.js";

const supportedExtensions = [".html", ".ts", ".json"];

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);
  const root = resolve(options.root);
  const files = await readWorkspaceFiles(root);
  const catalog = createCatalog(files);
  const diagnostics = getCatalogDiagnostics(catalog);

  if (diagnostics.length === 0) {
    console.log("Angular i18n catalogs are complete.");
    return 0;
  }

  for (const diagnostic of diagnostics) {
    if (options.githubAnnotations) {
      console.error(toGithubAnnotation(diagnostic));
      continue;
    }

    const location = diagnostic.entry
      ? `${diagnostic.entry.sourceFile}:${diagnostic.entry.range.start.line}:${diagnostic.entry.range.start.column}`
      : "<workspace>";
    const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";

    console.error(`${location} ${diagnostic.severity} ${diagnostic.kind}${locale}: ${diagnostic.message}`);
  }

  return 1;
}

interface CliOptions {
  root: string;
  githubAnnotations: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const positional: string[] = [];
  let githubAnnotations = false;

  for (const arg of args) {
    if (arg === "--github-annotations") {
      githubAnnotations = true;
    } else if (arg === "--no-github-annotations") {
      githubAnnotations = false;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return {
    root: positional[0] ?? ".",
    githubAnnotations
  };
}

function toGithubAnnotation(diagnostic: ReturnType<typeof getCatalogDiagnostics>[number]): string {
  const command = diagnostic.severity === "error" ? "error" : "warning";
  const properties = diagnostic.entry
    ? `file=${escapeGithubCommandProperty(diagnostic.entry.sourceFile)},line=${diagnostic.entry.range.start.line},col=${diagnostic.entry.range.start.column},title=${escapeGithubCommandProperty(diagnostic.kind)}`
    : `title=${escapeGithubCommandProperty(diagnostic.kind)}`;
  const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";

  return `::${command} ${properties}::${escapeGithubCommandMessage(`${diagnostic.kind}${locale}: ${diagnostic.message}`)}`;
}

function escapeGithubCommandProperty(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function escapeGithubCommandMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

async function readWorkspaceFiles(root: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];

  await collectWorkspaceFiles(root, root, files);

  return files;
}

async function collectWorkspaceFiles(root: string, directory: string, files: WorkspaceFile[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const relativePath = toWorkspacePath(relative(root, absolutePath));

    if (isIgnoredWorkspacePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectWorkspaceFiles(root, absolutePath, files);
      continue;
    }

    if (!entry.isFile() || !supportedExtensions.some((extension) => entry.name.endsWith(extension))) {
      continue;
    }

    files.push({
      path: relativePath,
      content: await readFile(absolutePath, "utf8")
    });
  }
}

function toWorkspacePath(path: string): string {
  return path.split("\\").join("/");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
