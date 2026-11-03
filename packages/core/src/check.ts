#!/usr/bin/env node
import { readdir, readFile, appendFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createCatalog, getCatalogDiagnostics, isIgnoredWorkspacePath, type WorkspaceFile } from "./index.js";

const supportedExtensions = [".html", ".ts", ".json"];

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(args);
  const root = resolve(options.root);
  const files = await readWorkspaceFiles(root);
  validateRuntimeCatalogs(files);
  const catalog = createCatalog(files);
  const diagnostics = getCatalogDiagnostics(catalog);
  const annotationRoot = options.annotationRoot ?? process.env.GITHUB_WORKSPACE;
  const repositoryPath = (file: string) => annotationRoot ? toWorkspacePath(relative(resolve(annotationRoot), resolve(root, file))) : file;
  if (options.githubSummary) {
    if (!process.env.GITHUB_STEP_SUMMARY) throw new Error("--github-summary requires GITHUB_STEP_SUMMARY.");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, createGithubSummary(diagnostics, repositoryPath));
  }

  if (diagnostics.length === 0) {
    console.log("Angular i18n catalogs are complete.");
    return 0;
  }

  for (const [index, diagnostic] of diagnostics.entries()) {
    if (options.githubAnnotations) {
      if (index < 10) console.error(toGithubAnnotation(diagnostic, repositoryPath));
      continue;
    }

    const location = diagnostic.entry
      ? `${diagnostic.entry.sourceFile}:${diagnostic.entry.range.start.line}:${diagnostic.entry.range.start.column}`
      : "<workspace>";
    const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";

    console.error(`${location} ${diagnostic.severity} ${diagnostic.kind}${locale}: ${diagnostic.message}`);
  }
  if (options.githubAnnotations && diagnostics.length > 10) console.log(`${diagnostics.length} findings; the first 10 are annotated. See the job summary for details.`);

  return 1;
}

interface CliOptions {
  root: string;
  githubAnnotations: boolean;
  githubSummary: boolean;
  annotationRoot?: string;
}

function parseArgs(args: string[]): CliOptions {
  const positional: string[] = [];
  let githubAnnotations = false;
  let githubSummary = false;
  let annotationRoot: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--github-annotations") {
      githubAnnotations = true;
    } else if (arg === "--no-github-annotations") {
      githubAnnotations = false;
    } else if (arg === "--github-summary") {
      githubSummary = true;
    } else if (arg === "--annotation-root") {
      annotationRoot = args[++index];
      if (!annotationRoot || annotationRoot.startsWith("--")) throw new Error("--annotation-root requires a directory.");
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) throw new Error("Scan one project at a time. Supply one project directory.");
  return {
    root: positional[0] ?? ".",
    githubAnnotations,
    githubSummary,
    ...(annotationRoot ? { annotationRoot } : {})
  };
}

function toGithubAnnotation(diagnostic: ReturnType<typeof getCatalogDiagnostics>[number], repositoryPath: (file: string) => string): string {
  // All findings block this CLI check, independently of editor diagnostic severity.
  const command = "error";
  const properties = diagnostic.entry
    ? `file=${escapeGithubCommandProperty(repositoryPath(diagnostic.entry.sourceFile))},line=${diagnostic.entry.range.start.line},col=${diagnostic.entry.range.start.column},title=${escapeGithubCommandProperty(diagnostic.kind)}`
    : `title=${escapeGithubCommandProperty(diagnostic.kind)}`;
  const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";

  return `::${command} ${properties}::${escapeGithubCommandMessage(`${diagnostic.kind}${locale}: ${diagnostic.message}`)}`;
}

function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("`", "&#96;").replaceAll("[", "&#91;").replaceAll("]", "&#93;").replaceAll(/\r?\n/g, " ");
}

function createGithubSummary(diagnostics: ReturnType<typeof getCatalogDiagnostics>, repositoryPath: (file: string) => string): string {
  const labels = { "duplicate-source-id": "Duplicate ID", "missing-translation": "Missing translation", "extra-translation": "Orphaned translation" };
  const lines = ["## Angular i18n catalog checks", "", diagnostics.length ? `**Failed: ${diagnostics.length} findings.**` : "**Passed: catalogs are complete.**", ""];
  for (const [kind, label] of Object.entries(labels)) lines.push(`- ${label}: ${diagnostics.filter(diagnostic => diagnostic.kind === kind).length}`);
  if (!diagnostics.length) return lines.join("\n") + "\n";
  lines.push("", "| Finding | ID | Locale | Location |", "| --- | --- | --- | --- |");
  for (const diagnostic of diagnostics.slice(0, 100)) {
    let location = "Workspace";
    if (diagnostic.entry) {
      const path = repositoryPath(diagnostic.entry.sourceFile);
      const line = diagnostic.entry.range.start.line;
      location = `<code>${html(path)}:${line}</code>`;
      if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_SHA) {
        const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
        const url = `${server}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${path.split("/").map(encodeURIComponent).join("/")}#L${line}`;
        location = `[${location}](${url})`;
      }
    }
    lines.push(`| ${labels[diagnostic.kind]} | <code>${html(diagnostic.id)}</code> | ${html(diagnostic.locale ?? "—")} | ${location} |`);
  }
  if (diagnostics.length > 100) lines.push("", `Showing the first 100 of ${diagnostics.length} findings.`);
  lines.push("", "### How to fix", "", "- Missing translation: add the ID to the indicated locale's translations map.", "- Orphaned translation: remove the unused catalog key, or restore the intended source ID.", "- Duplicate ID: use a distinct custom ID for each source message and update its catalog keys.", "", "The check only reports findings; it does not modify files or generate translations.");
  return lines.join("\n") + "\n";
}

function validateRuntimeCatalogs(files: WorkspaceFile[]): void {
  const catalogs = files.filter(file => /(?:^|\/)messages\.[^./]+\.json$/.test(file.path));
  if (!catalogs.length) throw new Error("No messages.<locale>.json catalogs found. Select one Angular project containing runtime JSON catalogs.");
  for (const file of catalogs) {
    let value: unknown;
    try { value = JSON.parse(file.content); }
    catch { throw new Error(`Invalid runtime JSON catalog: ${file.path}. Fix its JSON syntax before checking translations.`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid runtime JSON catalog: ${file.path}. Expected an object with a translations map.`);
    const object = value as Record<string, unknown>;
    const translations = "translations" in object ? object.translations : object;
    if (!translations || typeof translations !== "object" || Array.isArray(translations) || Object.values(translations).some(text => typeof text !== "string")) {
      throw new Error(`Invalid runtime JSON catalog: ${file.path}. Translation values must be strings.`);
    }
  }
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

