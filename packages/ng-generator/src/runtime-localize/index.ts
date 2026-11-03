import { parse as parseJson, type ParseError } from "jsonc-parser";
import { posix } from "node:path";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks/index.js";
import { branchAndMerge, chain, SchematicsException, type Rule, type Tree, type SchematicContext } from "@angular-devkit/schematics";

import { selectProjects, type ProjectSelectionOptions } from "../project-selection.js";
import { setupStep } from "../diagnostics.js";

export interface RuntimeLocalizeOptions extends ProjectSelectionOptions {
  sourceLocale?: string;
  locales?: string[];
  queryParam?: string;
}

interface AngularWorkspace {
  projects?: Record<string, AngularProject>;
}

export interface AngularProject {
  name?: string;
  projectType?: string;
  root?: string;
  sourceRoot?: string;
  i18n?: { sourceLocale?: string | { code: string }; locales?: Record<string, unknown> };
  architect?: Record<string, AngularTarget>;
  targets?: Record<string, AngularTarget>;
}

interface AngularTarget {
  builder?: string;
  executor?: string;
  options?: Record<string, unknown>;
  configurations?: Record<string, unknown>;
  defaultConfiguration?: string;
}

export function runtimeLocalize(options: RuntimeLocalizeOptions): Rule {
  return async (tree, setupContext) => {
    const trace = options.verbose ? (step: string) => setupContext.logger.info(`[setup] ${step}`) : undefined;
    const applications = setupStep("Discover Angular applications (angular.json, project.json, package.json#nx)", () => findApplications(tree), trace);
    for (const app of applications) trace?.(`Discovered application "${app.projectName}" (root: ${app.project.root || "."})`);
    const selected = await selectProjects(applications, options, tree.exists("nx.json"));
    trace?.(`Selected projects: ${selected.join(", ")}`);
    let dependencyChanged = false;
    return branchAndMerge(chain([
      ...selected.map(project => (tree: Tree, context: SchematicContext) => setupStep(`Project "${project}"`, () => {
        dependencyChanged = configureRuntimeProject(tree, context, { ...options, project }) || dependencyChanged;
        return tree;
      }, trace, true)),
      (tree, context) => {
        if (dependencyChanged && !options.skipInstall) context.addTask(new NodePackageInstallTask());
        return tree;
      }
    ]));
  };
}

export function configureRuntimeProject(tree: Tree, context: SchematicContext, options: RuntimeLocalizeOptions): boolean {
  const trace = options.verbose ? (step: string) => context.logger.info(`[setup] ${step}`) : undefined;
  const { project, projectName, save } = resolveProject(tree, options.project);

  const { sourceLocale, runtimeLocales, sourceRoot, localePath, catalogs, queryParam } = setupStep(`Discover locales and catalogs: ${project.sourceRoot ?? project.root ?? "."}`, () => discoverLocales(tree, project, options), trace);
  if (runtimeLocales.length === 0) context.logger.info("No target languages found. Configure i18n.locales or add messages.<locale>.json catalogs, then rerun. Only the source catalog is created.");
  const mainPath = getMainPath(project);

  setupStep(`Update Angular localization targets: ${projectName}`, () => {
    updateProject(projectName, project, sourceLocale, localePath);
    save();
  }, trace);

  setupStep(`Generate runtime catalogs and locale loader: ${sourceRoot}`, () => writeRuntimeCatalogSetup(tree, { sourceLocale, runtimeLocales, sourceRoot, catalogs, queryParam }), trace);
  setupStep(`Patch standalone bootstrap: ${mainPath}`, () => patchMainFile(tree, mainPath, joinPath(sourceRoot, "locale-loader.ts")), trace);
  return setupStep(`Check Angular localize dependency: ${project.root || "."}`, () => addLocalizeDependency(tree, project.root ?? ""), trace);
}

export function discoverLocales(tree: Tree, project: AngularProject, options: RuntimeLocalizeOptions = {}) {
  const configuredSource = project.i18n?.sourceLocale;
  const sourceLocale = options.sourceLocale
    ?? (typeof configuredSource === "string" ? configuredSource : configuredSource?.code)
    ?? "en-US";
  const queryParam = options.queryParam ?? "locale";
  const sourceRoot = project.sourceRoot ?? joinPath(project.root ?? "", "src");
  const localePath = joinPath(sourceRoot, "locale");
  const catalogs = discoverCatalogs(tree, sourceRoot);
  for (const [locale, configuration] of Object.entries(project.i18n?.locales ?? {})) {
    const path = configuredJsonCatalog(configuration);
    if (path) catalogs.set(locale, path);
  }
  const runtimeLocales = unique(options.locales?.length ? options.locales : [
    ...Object.keys(project.i18n?.locales ?? {}), ...catalogs.keys()
  ]).filter(locale => locale !== sourceLocale);
  for (const locale of [sourceLocale, ...runtimeLocales]) {
    if (!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(locale)) {
      throw new SchematicsException(`Invalid discovered or configured locale: "${locale}".`);
    }
    if (!catalogs.has(locale)) catalogs.set(locale, joinPath(localePath, `messages.${locale}.json`));
  }
  return { sourceLocale, runtimeLocales, sourceRoot, localePath, catalogs, queryParam };
}

export function writeRuntimeCatalogSetup(tree: Tree, setup: Pick<ReturnType<typeof discoverLocales>, "sourceLocale" | "runtimeLocales" | "sourceRoot" | "catalogs" | "queryParam">, loaderPath = joinPath(setup.sourceRoot, "locale-loader.ts")): void {
  const { sourceLocale, runtimeLocales, sourceRoot, catalogs, queryParam } = setup;
  createCatalogs(tree, catalogs, [sourceLocale, ...runtimeLocales]);
  upsertFile(tree, loaderPath, createLocaleLoader(sourceLocale, runtimeLocales, queryParam, posix.dirname(loaderPath), catalogs));
}

function updateProject(
  projectName: string,
  project: AngularProject,
  sourceLocale: string,
  localePath: string
): void {
  const targets = project.architect ?? project.targets;
  const build = targets?.build;

  if (!targets || !build) {
    throw new SchematicsException(`Project "${projectName}" does not define a build target.`);
  }

  project.i18n ??= {};
  project.i18n.sourceLocale = typeof project.i18n.sourceLocale === "object"
    ? { ...project.i18n.sourceLocale, code: sourceLocale }
    : sourceLocale;
  build.options ??= {};
  build.options.polyfills = addLocalizePolyfill(build.options.polyfills);
  targets["extract-i18n"] = {
    [build.executor ? "executor" : "builder"]: extractExecutor(build.executor ?? build.builder),
    options: {
      buildTarget: `${projectName}:build`,
      format: "json",
      outFile: `messages.${sourceLocale}.json`,
      outputPath: localePath
    }
  };

}

export function addLocalizeDependency(tree: Tree, projectRoot: string): boolean {
  type Package = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const packages = unique([joinPath(projectRoot, "package.json"), "package.json"])
    .filter(path => tree.exists(path))
    .map(path => ({ path, pkg: readJson<Package>(tree, path) }));
  if (packages.some(({ pkg }) => pkg.dependencies?.["@angular/localize"] || pkg.devDependencies?.["@angular/localize"])) return false;
  const selected = packages.find(({ pkg }) => pkg.dependencies?.["@angular/core"] || pkg.devDependencies?.["@angular/core"]);
  if (!selected) {
    if (packages.length === 0) return false;
    throw new SchematicsException("Install @angular/core in the workspace or application package.json before running this generator.");
  }
  const { pkg, path } = selected;
  const version = (pkg.dependencies?.["@angular/core"] ?? pkg.devDependencies?.["@angular/core"])!;
  pkg.devDependencies ??= {};
  pkg.devDependencies["@angular/localize"] = version;
  writeJson(tree, path, pkg);
  return true;
}

function configuredJsonCatalog(configuration: unknown): string | undefined {
  const translation = configuration && typeof configuration === "object" && "translation" in configuration
    ? configuration.translation
    : configuration;
  const paths = (Array.isArray(translation) ? translation : [translation])
    .filter((path): path is string => typeof path === "string" && path.endsWith(".json"));
  if (paths.length > 1) throw new SchematicsException("Multiple JSON catalogs configured for one locale. Keep one runtime catalog per locale.");
  if (!paths[0]) return undefined;
  const path = posix.normalize(paths[0]);
  if (posix.isAbsolute(path) || path === ".." || path.startsWith("../")) {
    throw new SchematicsException(`Catalog path must stay within the workspace: ${path}`);
  }
  return path;
}

function discoverCatalogs(tree: Tree, sourceRoot: string): Map<string, string> {
  const catalogs = new Map<string, string>();
  const visit = (directory: string): void => {
    const entry = tree.getDir(directory);
    for (const filename of entry.subfiles) {
      const locale = /^messages\.([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*)\.json$/.exec(filename)?.[1];
      if (!locale) continue;
      const path = joinPath(directory, filename);
      if (catalogs.has(locale)) {
        throw new SchematicsException(`Multiple catalogs for "${locale}" in the selected app: ${catalogs.get(locale)}, ${path}. Keep one runtime catalog per locale.`);
      }
      catalogs.set(locale, path);
    }
    for (const child of entry.subdirs) {
      if (!child.startsWith(".") && !["node_modules", "dist", "coverage", "storybook-static"].includes(child)) visit(joinPath(directory, child));
    }
  };
  visit(sourceRoot);
  return catalogs;
}

function createCatalogs(tree: Tree, catalogs: Map<string, string>, locales: string[]): void {
  for (const locale of locales) {
    const catalogPath = catalogs.get(locale)!;
    if (!tree.exists(catalogPath)) {
      tree.create(catalogPath, `${JSON.stringify({ locale, translations: {} }, null, 2)}\n`);
    }
  }
}

function patchMainFile(tree: Tree, mainPath: string, loaderPath: string): void {
  const content = readText(tree, mainPath);

  if (content.includes("loadRuntimeTranslations")) {
    return;
  }

  const loaderImport = relativeImport(posix.dirname(mainPath), loaderPath.replace(/\.ts$/, ""));
  const importStatement = `import { loadRuntimeTranslations } from ${JSON.stringify(loaderImport)};\n`;
  const withImport = `${importStatement}${content}`;
  const bootstrapStart = withImport.indexOf("bootstrapApplication(");

  if (bootstrapStart === -1) {
    throw new SchematicsException(`Could not find bootstrapApplication(...) in ${mainPath}.`);
  }

  const bootstrapEnd = findCallExpressionEnd(withImport, bootstrapStart + "bootstrapApplication".length);
  const catchEnd = findBootstrapChainEnd(withImport, bootstrapEnd);
  const bootstrapCall = withImport.slice(bootstrapStart, bootstrapEnd);
  const bootstrapTail = withImport.slice(bootstrapEnd, catchEnd);
  const patched = `${withImport.slice(0, bootstrapStart)}loadRuntimeTranslations().then(() => ${bootstrapCall})${bootstrapTail}${withImport.slice(catchEnd)}`;

  tree.overwrite(mainPath, patched);
}

function findCallExpressionEnd(content: string, openParenSearchStart: number): number {
  const openParen = content.indexOf("(", openParenSearchStart);

  if (openParen === -1) {
    throw new SchematicsException("Could not parse bootstrapApplication call.");
  }

  let depth = 0;
  let inString: string | undefined;
  let escaped = false;

  for (let index = openParen; index < content.length; index += 1) {
    const character = content[index]!;

    if (inString) {
      escaped = character === "\\" && !escaped;
      if (character === inString && !escaped) {
        inString = undefined;
      } else if (character !== "\\") {
        escaped = false;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      inString = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  throw new SchematicsException("Could not parse bootstrapApplication call.");
}

function findBootstrapChainEnd(content: string, callEnd: number): number {
  const semicolon = content.indexOf(";", callEnd);
  const nextLine = content.indexOf("\n", callEnd);

  if (semicolon !== -1 && (nextLine === -1 || semicolon < nextLine)) {
    return semicolon + 1;
  }

  return callEnd;
}

function relativeImport(from: string, to: string): string {
  const path = posix.relative(from, to);
  return path.startsWith(".") ? path : `./${path}`;
}

function createLocaleLoader(sourceLocale: string, runtimeLocales: string[], queryParam: string, sourceRoot: string, catalogs: Map<string, string>): string {
  const defaultLocales = unique([sourceLocale, ...(sourceLocale === "en-US" && !runtimeLocales.includes("en") ? ["en"] : [])]);
  const loaderEntries = runtimeLocales
    .map((locale) => `  ${JSON.stringify(locale)}: () => import(${JSON.stringify(relativeImport(sourceRoot, catalogs.get(locale)!))}).then((module) => readTranslations(module.default))`)
    .join(",\n");
  const runtimeLocaleType = runtimeLocales.length > 0 ? "keyof typeof loaders" : "never";
  const supportedLocales = [...defaultLocales, ...runtimeLocales].map((locale) => JSON.stringify(locale)).join(" | ");
  const requestedChecks = [...defaultLocales, ...runtimeLocales]
    .map((locale) => `requested === ${JSON.stringify(locale)}`)
    .join(" || ");

  if (runtimeLocales.length === 0) {
    return `export type SupportedLocale = ${supportedLocales};

export async function loadRuntimeTranslations(): Promise<SupportedLocale> {
  const requested = new URLSearchParams(globalThis.location.search).get(${JSON.stringify(queryParam)});
  const locale: SupportedLocale = ${requestedChecks} ? requested : ${JSON.stringify(sourceLocale)};
  await loadTranslationsForLocale(locale);
  return locale;
}

export async function loadTranslationsForLocale(locale: SupportedLocale): Promise<void> {
  document.documentElement.lang = locale;
}
`;
  }

  return `import { loadTranslations } from "@angular/localize";

const defaultLocales = new Set(${JSON.stringify(defaultLocales)});
const loaders = {
${loaderEntries}
} as const;

type RuntimeLocale = ${runtimeLocaleType};
export type SupportedLocale = ${supportedLocales};

export async function loadRuntimeTranslations(): Promise<SupportedLocale> {
  const locale = readLocale();

  await loadTranslationsForLocale(locale);
  return locale;
}

export async function loadTranslationsForLocale(locale: SupportedLocale): Promise<void> {
  if (defaultLocales.has(locale)) {
    document.documentElement.lang = locale;
    return;
  }

  if (isRuntimeLocale(locale)) {
    const loader = loaders[locale];
    loadTranslations(await loader());
  }
  document.documentElement.lang = locale;
}

function readLocale(): SupportedLocale {
  const requested = new URLSearchParams(globalThis.location.search).get(${JSON.stringify(queryParam)});

  if (${requestedChecks}) {
    return requested;
  }

  return ${JSON.stringify(sourceLocale)};
}

function isRuntimeLocale(locale: SupportedLocale): locale is RuntimeLocale {
  return ${runtimeLocales.map((locale) => `locale === ${JSON.stringify(locale)}`).join(" || ") || "false"};
}

function readTranslations(value: unknown): Record<string, string> {
  if (isTranslationRecord(value)) {
    return value;
  }

  if (isRecord(value) && isTranslationRecord(value.translations)) {
    return value.translations;
  }

  throw new Error("Expected Angular runtime translation JSON.");
}

function isTranslationRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
`;
}

function getMainPath(project: AngularProject): string {
  const buildOptions = (project.architect ?? project.targets)?.build?.options;
  const main = buildOptions?.browser ?? buildOptions?.main;

  if (typeof main !== "string") {
    throw new SchematicsException("Could not find build.options.browser or build.options.main in the selected project.");
  }

  return main;
}

function addLocalizePolyfill(polyfills: unknown): unknown {
  if (Array.isArray(polyfills)) {
    return polyfills.includes("@angular/localize/init") ? polyfills : ["@angular/localize/init", ...polyfills];
  }

  if (typeof polyfills === "string") {
    return polyfills === "@angular/localize/init" ? polyfills : ["@angular/localize/init", polyfills];
  }

  return ["@angular/localize/init"];
}

function extractExecutor(build: string | undefined): string {
  if (build?.startsWith("@nx/angular:")) return "@nx/angular:extract-i18n";
  if (build?.startsWith("@angular/build:")) return "@angular/build:extract-i18n";
  return "@angular-devkit/build-angular:extract-i18n";
}

export function findProjects(tree: Tree): {
  project: AngularProject;
  projectName: string;
  save: () => void;
}[] {
  const candidates: { project: AngularProject; projectName: string; save: () => void }[] = [];
  // A repository can contain both an Angular CLI workspace and Nx projects.
  if (tree.exists("angular.json")) {
    const workspace = readJson<AngularWorkspace>(tree, "angular.json");
    for (const [projectName, project] of Object.entries(workspace.projects ?? {})) {
      candidates.push({ projectName, project, save: () => writeJson(tree, "angular.json", workspace) });
    }
  }
  if (tree.exists("nx.json")) {
    const ignored = new Set(["node_modules", ".git", ".nx", "dist", "coverage", "storybook-static"]);
    const discover = (directory: string): void => {
      const entry = tree.getDir(directory);
      const projectPath = joinPath(directory, "project.json");
      const packagePath = joinPath(directory, "package.json");
      const pkg = tree.exists(packagePath) ? readJson<{ name?: string; nx?: AngularProject }>(tree, packagePath) : undefined;
      if (pkg?.nx !== undefined && (!pkg.nx || typeof pkg.nx !== "object" || Array.isArray(pkg.nx))) {
        throw new SchematicsException(`Expected an Nx configuration object in ${packagePath}#nx.`);
      }
      const projectJson = tree.exists(projectPath) ? readJson<AngularProject>(tree, projectPath) : undefined;
      if (projectJson || pkg?.nx) {
        const root = directory.replace(/^\//, "");
        const duplicate = candidates.findIndex(candidate => posix.normalize(candidate.project.root || ".") === posix.normalize(root || "."));
        const existing = candidates[duplicate];
        const project = mergeProjectConfiguration(pkg?.nx ?? {}, projectJson ?? {});
        project.root ??= root;
        const projectName = project.name ?? pkg?.name ?? existing?.projectName ?? root.split("/").pop() ?? "";
        // Nx's schematic adapter can expose either configuration through a virtual angular.json.
        if (duplicate !== -1) candidates.splice(duplicate, 1);
        const initial = JSON.parse(JSON.stringify(project)) as AngularProject;
        candidates.push({ projectName, project, save: () => {
          const path = projectJson ? projectPath : packagePath;
          const document = readJson<Record<string, unknown>>(tree, path);
          const destination = projectJson ? document : document.nx as Record<string, unknown>;
          // Persist changed settings only, leaving inferred names/roots and package metadata alone.
          for (const key of Object.keys(project) as (keyof AngularProject)[]) {
            if (JSON.stringify(project[key]) === JSON.stringify(initial[key])) continue;
            if (key === "targets" || key === "architect") {
              const changed = Object.fromEntries(Object.entries(project[key] ?? {}).filter(([name, target]) => JSON.stringify(target) !== JSON.stringify(initial[key]?.[name])));
              destination[key] = { ...(destination[key] as Record<string, unknown> | undefined), ...changed };
            } else destination[key] = project[key];
          }
          writeJson(tree, path, document);
        } });
      }
      for (const child of entry.subdirs) {
        if (!ignored.has(child) && !child.startsWith(".")) discover(joinPath(directory, child));
      }
    };
    discover("");
  }
  const names = candidates.map(app => app.projectName);
  if (new Set(names).size !== names.length) throw new SchematicsException("Project names must be unique across the workspace.");
  return candidates.sort((left, right) => left.projectName.localeCompare(right.projectName));
}

function mergeProjectConfiguration(base: AngularProject, override: AngularProject): AngularProject {
  const project = { ...base, ...override };
  for (const key of ["targets", "architect"] as const) {
    if (!base[key] && !override[key]) continue;
    project[key] = { ...base[key], ...override[key] };
    for (const [name, target] of Object.entries(override[key] ?? {})) {
      const previous = base[key]?.[name];
      project[key][name] = { ...previous, ...target,
        ...(previous?.options || target.options ? { options: { ...previous?.options, ...target.options } } : {}),
        ...(previous?.configurations || target.configurations ? { configurations: { ...previous?.configurations, ...target.configurations } } : {})
      };
    }
  }
  return project;
}

export function findApplications(tree: Tree) {
  return findProjects(tree).filter(({ project }) => {
    const target = (project.architect ?? project.targets)?.build;
    const executor = target?.executor ?? target?.builder ?? "";
    return project.projectType === "application" && /^(?:@angular\/build|@angular-devkit\/build-angular|@nx\/angular):/.test(executor);
  });
}

function resolveProject(tree: Tree, requestedName?: string) {
  const applications = findApplications(tree);
  const selected = applications.find(app => app.projectName === requestedName);
  if (!selected) throw new SchematicsException(`Angular application "${requestedName}" was not found.`);
  return selected;
}


export function readJson<T>(tree: Tree, path: string): T {
  const errors: ParseError[] = [];
  const value = parseJson(readText(tree, path), errors, { allowTrailingComma: true }) as T;
  if (errors.length) throw new SchematicsException(`Invalid JSON configuration: ${path}.`);
  return value;
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.overwrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readText(tree: Tree, path: string): string {
  const buffer = tree.read(path);

  if (!buffer) {
    throw new SchematicsException(`Expected ${path} to exist.`);
  }

  return buffer.toString("utf8");
}

function upsertFile(tree: Tree, path: string, content: string): void {
  if (tree.exists(path)) {
    tree.overwrite(path, content);
  } else {
    tree.create(path, content);
  }
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replaceAll(/\/+/g, "/");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
