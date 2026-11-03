// scripts/catalog-action/index.ts
import { appendFile as appendFile2, realpath } from "node:fs/promises";
import { resolve as resolve2, relative as relative2, isAbsolute } from "node:path";

// packages/core/src/check.ts
import { readdir, readFile, appendFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

// packages/core/src/index.ts
var TEMPLATE_I18N_PATTERN = /\bi18n(?:-[\w-]+)?\s*=\s*(["'])(?:(?!\1).)*?@@([A-Za-z0-9_.-]+)/gs;
var LOCALIZE_PATTERN = /\$localize`[^`]*?@@([A-Za-z0-9_.-]+)(?::|`)/gs;
var JSON_PROPERTY_PATTERN = /"((?:[^"\\]|\\.)+)"\s*:/g;
var RUNTIME_TRANSLATION_FILE_PATTERN = /(?:^|\/)messages\.([^.\/]+)\.json$/;
function createCatalog(files) {
  const entries = files.flatMap(scanFile);
  return {
    entries,
    sourceEntries: entries.filter((entry) => entry.kind !== "translation"),
    translationEntries: entries.filter((entry) => entry.kind === "translation"),
    locales: [...new Set(files.filter((file) => !isIgnoredWorkspacePath(file.path) && isTranslationCatalogPath(file.path) && parseRuntimeTranslations(file.content)).flatMap((file) => parseLocaleFromPath(file.path) ?? []))].sort()
  };
}
function scanFile(file) {
  if (isIgnoredWorkspacePath(file.path)) {
    return [];
  }
  if (file.path.endsWith(".html")) {
    return scanTemplateFile(file);
  }
  if (file.path.endsWith(".ts")) {
    return scanTypeScriptFile(file);
  }
  if (isTranslationCatalogPath(file.path)) {
    return scanJsonTranslationFile(file);
  }
  return [];
}
function scanTemplateFile(file) {
  return entriesFromMatches(file, TEMPLATE_I18N_PATTERN, 2, "template");
}
function scanTypeScriptFile(file) {
  return entriesFromMatches(file, LOCALIZE_PATTERN, 1, "localize");
}
function scanJsonTranslationFile(file) {
  const locale = parseLocaleFromPath(file.path);
  const translations = parseRuntimeTranslations(file.content);
  if (!translations) {
    return [];
  }
  return [...file.content.matchAll(JSON_PROPERTY_PATTERN)].flatMap((match) => {
    const rawId = match[1];
    if (!rawId || match.index === void 0) {
      return [];
    }
    const id = unquoteJsonString(rawId);
    if (typeof translations[id] !== "string") {
      return [];
    }
    const idOffset = match.index + 1;
    const entry = {
      id,
      kind: "translation",
      range: rangeForText(file, idOffset, rawId.length),
      ...locationAtOffset(file, match.index)
    };
    if (locale) {
      entry.locale = locale;
    }
    return [entry];
  });
}
function findDuplicateIds(catalog) {
  const grouped = groupById(catalog.sourceEntries);
  return new Map([...grouped].filter(([, entries]) => entries.length > 1));
}
function compareTranslations(catalog) {
  const sourceIds = new Set(catalog.sourceEntries.map((entry) => entry.id));
  const entriesByLocale = new Map((catalog.locales ?? []).map((locale) => [locale, []]));
  for (const entry of catalog.translationEntries) {
    const locale = entry.locale ?? "unknown";
    const entries = entriesByLocale.get(locale) ?? [];
    entries.push(entry);
    entriesByLocale.set(locale, entries);
  }
  return [...entriesByLocale].map(([locale, entries]) => {
    const translationIds = new Set(entries.map((entry) => entry.id));
    return {
      locale,
      missing: sortedDifference(sourceIds, translationIds),
      extra: sortedDifference(translationIds, sourceIds)
    };
  }).sort((left, right) => left.locale.localeCompare(right.locale));
}
function getCatalogDiagnostics(catalog) {
  const duplicateDiagnostics = [...findDuplicateIds(catalog)].flatMap(
    ([id, entries]) => entries.map((entry) => ({
      kind: "duplicate-source-id",
      severity: "warning",
      id,
      entry,
      message: `Duplicate Angular localization ID "${id}".`
    }))
  );
  const translationDiagnostics = compareTranslations(catalog).flatMap((coverage) => [
    ...coverage.missing.flatMap(
      (id) => catalog.sourceEntries.filter((entry) => entry.id === id).map((entry) => ({
        kind: "missing-translation",
        severity: "warning",
        id,
        locale: coverage.locale,
        entry,
        message: `Missing ${coverage.locale} translation for Angular localization ID "${id}".`
      }))
    ),
    ...coverage.extra.flatMap(
      (id) => catalog.translationEntries.filter((entry) => entry.locale === coverage.locale && entry.id === id).map((entry) => ({
        kind: "extra-translation",
        severity: "warning",
        id,
        locale: coverage.locale,
        entry,
        message: `Extra ${coverage.locale} translation for unknown Angular localization ID "${id}".`
      }))
    )
  ]);
  return [...duplicateDiagnostics, ...translationDiagnostics].sort(compareDiagnostics);
}
function isIgnoredWorkspacePath(path) {
  return path.split("/").some((segment) => segment === "node_modules" || segment === "dist" || segment === ".angular" || segment === "storybook-static");
}
function entriesFromMatches(file, pattern, idGroupIndex, kind) {
  return [...file.content.matchAll(pattern)].flatMap((match) => {
    const id = match[idGroupIndex];
    if (!id || match.index === void 0) {
      return [];
    }
    const idOffset = match.index + match[0].indexOf(id);
    return [
      {
        id,
        kind,
        range: rangeForText(file, idOffset, id.length),
        ...locationAtOffset(file, match.index)
      }
    ];
  });
}
function locationAtOffset(file, offset) {
  const before = file.content.slice(0, offset);
  const lines = before.split(/\r?\n/);
  const line = lines.length;
  const lastLine = lines.at(-1) ?? "";
  return {
    sourceFile: file.path,
    offset,
    line,
    column: lastLine.length + 1
  };
}
function rangeForText(file, offset, length) {
  return {
    start: locationAtOffset(file, offset),
    end: locationAtOffset(file, offset + length)
  };
}
function isTranslationCatalogPath(path) {
  return RUNTIME_TRANSLATION_FILE_PATTERN.test(path);
}
function parseLocaleFromPath(path) {
  return path.match(RUNTIME_TRANSLATION_FILE_PATTERN)?.[1];
}
function parseRuntimeTranslations(content) {
  try {
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) {
      return void 0;
    }
    return isRecord(parsed.translations) ? parsed.translations : parsed;
  } catch {
    return void 0;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unquoteJsonString(value) {
  return JSON.parse(`"${value}"`);
}
function groupById(entries) {
  const grouped = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const entriesForId = grouped.get(entry.id) ?? [];
    entriesForId.push(entry);
    grouped.set(entry.id, entriesForId);
  }
  return grouped;
}
function sortedDifference(left, right) {
  return [...left].filter((id) => !right.has(id)).sort((a, b) => a.localeCompare(b));
}
function compareDiagnostics(left, right) {
  return left.id.localeCompare(right.id) || (left.locale ?? "").localeCompare(right.locale ?? "") || left.kind.localeCompare(right.kind);
}

// packages/core/src/check.ts
var supportedExtensions = [".html", ".ts", ".json"];
async function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const root = resolve(options.root);
  const files = await readWorkspaceFiles(root);
  validateRuntimeCatalogs(files);
  const catalog = createCatalog(files);
  const diagnostics = getCatalogDiagnostics(catalog);
  const annotationRoot = options.annotationRoot ?? process.env.GITHUB_WORKSPACE;
  const repositoryPath = (file) => annotationRoot ? toWorkspacePath(relative(resolve(annotationRoot), resolve(root, file))) : file;
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
    const location = diagnostic.entry ? `${diagnostic.entry.sourceFile}:${diagnostic.entry.range.start.line}:${diagnostic.entry.range.start.column}` : "<workspace>";
    const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";
    console.error(`${location} ${diagnostic.severity} ${diagnostic.kind}${locale}: ${diagnostic.message}`);
  }
  if (options.githubAnnotations && diagnostics.length > 10) console.log(`${diagnostics.length} findings; the first 10 are annotated. See the job summary for details.`);
  return 1;
}
function parseArgs(args) {
  const positional = [];
  let githubAnnotations = false;
  let githubSummary = false;
  let annotationRoot;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
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
    ...annotationRoot ? { annotationRoot } : {}
  };
}
function toGithubAnnotation(diagnostic, repositoryPath) {
  const command = "error";
  const properties = diagnostic.entry ? `file=${escapeGithubCommandProperty(repositoryPath(diagnostic.entry.sourceFile))},line=${diagnostic.entry.range.start.line},col=${diagnostic.entry.range.start.column},title=${escapeGithubCommandProperty(diagnostic.kind)}` : `title=${escapeGithubCommandProperty(diagnostic.kind)}`;
  const locale = diagnostic.locale ? ` [${diagnostic.locale}]` : "";
  return `::${command} ${properties}::${escapeGithubCommandMessage(`${diagnostic.kind}${locale}: ${diagnostic.message}`)}`;
}
function html(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("`", "&#96;").replaceAll("[", "&#91;").replaceAll("]", "&#93;").replaceAll(/\r?\n/g, " ");
}
function createGithubSummary(diagnostics, repositoryPath) {
  const labels = { "duplicate-source-id": "Duplicate ID", "missing-translation": "Missing translation", "extra-translation": "Orphaned translation" };
  const lines = ["## Angular i18n catalog checks", "", diagnostics.length ? `**Failed: ${diagnostics.length} findings.**` : "**Passed: catalogs are complete.**", ""];
  for (const [kind, label] of Object.entries(labels)) lines.push(`- ${label}: ${diagnostics.filter((diagnostic) => diagnostic.kind === kind).length}`);
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
    lines.push(`| ${labels[diagnostic.kind]} | <code>${html(diagnostic.id)}</code> | ${html(diagnostic.locale ?? "\u2014")} | ${location} |`);
  }
  if (diagnostics.length > 100) lines.push("", `Showing the first 100 of ${diagnostics.length} findings.`);
  lines.push("", "### How to fix", "", "- Missing translation: add the ID to the indicated locale's translations map.", "- Orphaned translation: remove the unused catalog key, or restore the intended source ID.", "- Duplicate ID: use a distinct custom ID for each source message and update its catalog keys.", "", "The check only reports findings; it does not modify files or generate translations.");
  return lines.join("\n") + "\n";
}
function validateRuntimeCatalogs(files) {
  const catalogs = files.filter((file) => /(?:^|\/)messages\.[^./]+\.json$/.test(file.path));
  if (!catalogs.length) throw new Error("No messages.<locale>.json catalogs found. Select one Angular project containing runtime JSON catalogs.");
  for (const file of catalogs) {
    let value;
    try {
      value = JSON.parse(file.content);
    } catch {
      throw new Error(`Invalid runtime JSON catalog: ${file.path}. Fix its JSON syntax before checking translations.`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid runtime JSON catalog: ${file.path}. Expected an object with a translations map.`);
    const object = value;
    const translations = "translations" in object ? object.translations : object;
    if (!translations || typeof translations !== "object" || Array.isArray(translations) || Object.values(translations).some((text) => typeof text !== "string")) {
      throw new Error(`Invalid runtime JSON catalog: ${file.path}. Translation values must be strings.`);
    }
  }
}
function escapeGithubCommandProperty(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(":", "%3A").replaceAll(",", "%2C");
}
function escapeGithubCommandMessage(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
async function readWorkspaceFiles(root) {
  const files = [];
  await collectWorkspaceFiles(root, root, files);
  return files;
}
async function collectWorkspaceFiles(root, directory, files) {
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
function toWorkspacePath(path) {
  return path.split("\\").join("/");
}

// scripts/catalog-action/index.ts
function enabled(name, fallback) {
  const value = process.env[name] || fallback;
  if (!["true", "false"].includes(value)) throw new Error(`${name.replace("INPUT_", "").toLowerCase()} must be true or false.`);
  return value === "true";
}
try {
  const workspace = await realpath(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const input = process.env.INPUT_PATH || ".";
  if (isAbsolute(input)) throw new Error("path must be relative to the checked-out repository.");
  const root = await realpath(resolve2(workspace, input));
  const project = relative2(workspace, root);
  if (project === ".." || project.startsWith("../") || project.startsWith("..\\") || isAbsolute(project)) {
    throw new Error("path must stay inside the checked-out repository.");
  }
  const args = [root, "--annotation-root", workspace];
  if (enabled("INPUT_ANNOTATIONS", "true")) args.push("--github-annotations");
  if (enabled("INPUT_SUMMARY", "true") && process.env.GITHUB_STEP_SUMMARY) args.push("--github-summary");
  console.log(`Checking runtime JSON catalogs: ${project || "."}`);
  process.exitCode = await runCli(args);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const escaped = message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  console.error(`::error title=Catalog check could not run::${escaped}`);
  if (process.env.GITHUB_STEP_SUMMARY && process.env.INPUT_SUMMARY !== "false") {
    const safe = message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    await appendFile2(process.env.GITHUB_STEP_SUMMARY, `## Angular i18n catalog checks

**Could not run.**

<pre>${safe}</pre>

Check the project path and runtime JSON catalog syntax.
`);
  }
  process.exitCode = 1;
}
