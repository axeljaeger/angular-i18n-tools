import { SchematicsException, type Rule, type Tree } from "@angular-devkit/schematics";

export interface RuntimeLocalizeOptions {
  project?: string;
  sourceLocale?: string;
  locales?: string[];
  queryParam?: string;
}

interface AngularWorkspace {
  projects?: Record<string, AngularProject>;
}

interface AngularProject {
  projectType?: string;
  root?: string;
  sourceRoot?: string;
  architect?: Record<string, AngularTarget>;
  targets?: Record<string, AngularTarget>;
}

interface AngularTarget {
  builder?: string;
  options?: Record<string, unknown>;
  configurations?: Record<string, unknown>;
  defaultConfiguration?: string;
}

export function runtimeLocalize(options: RuntimeLocalizeOptions): Rule {
  return (tree) => {
    const workspace = readJson<AngularWorkspace>(tree, "angular.json");
    const projectName = options.project ?? findDefaultApplicationProject(workspace);
    const project = workspace.projects?.[projectName];

    if (!project) {
      throw new SchematicsException(`Angular project "${projectName}" was not found.`);
    }

    const sourceLocale = options.sourceLocale ?? "en-US";
    const runtimeLocales = unique((options.locales ?? ["de", "fr"]).filter((locale) => locale !== sourceLocale));
    const queryParam = options.queryParam ?? "locale";
    const sourceRoot = project.sourceRoot ?? joinPath(project.root ?? "", "src");
    const localePath = joinPath(sourceRoot, "locale");
    const mainPath = getMainPath(project);

    updateAngularWorkspace(workspace, projectName, project, sourceLocale, localePath);
    writeJson(tree, "angular.json", workspace);

    createCatalogs(tree, localePath, sourceLocale, runtimeLocales);
    upsertFile(tree, joinPath(sourceRoot, "locale-loader.ts"), createLocaleLoader(sourceLocale, runtimeLocales, queryParam));
    patchMainFile(tree, mainPath);

    return tree;
  };
}

function updateAngularWorkspace(
  workspace: AngularWorkspace,
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

  build.options ??= {};
  build.options.polyfills = addLocalizePolyfill(build.options.polyfills);
  targets["extract-i18n"] = {
    builder: "@angular-devkit/build-angular:extract-i18n",
    options: {
      buildTarget: `${projectName}:build`,
      format: "json",
      outFile: `messages.${sourceLocale}.json`,
      outputPath: localePath
    }
  };
  workspace.projects ??= {};
  workspace.projects[projectName] = project;
}

function createCatalogs(tree: Tree, localePath: string, sourceLocale: string, runtimeLocales: string[]): void {
  for (const locale of [sourceLocale, ...runtimeLocales]) {
    const catalogPath = joinPath(localePath, `messages.${locale}.json`);

    if (!tree.exists(catalogPath)) {
      tree.create(catalogPath, `${JSON.stringify({ locale, translations: {} }, null, 2)}\n`);
    }
  }
}

function patchMainFile(tree: Tree, mainPath: string): void {
  const content = readText(tree, mainPath);

  if (content.includes("loadRuntimeTranslations")) {
    return;
  }

  const importStatement = 'import { loadRuntimeTranslations } from "./locale-loader";\n';
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

function createLocaleLoader(sourceLocale: string, runtimeLocales: string[], queryParam: string): string {
  const defaultLocales = unique(["en", sourceLocale]);
  const loaderEntries = runtimeLocales
    .map((locale) => `  ${JSON.stringify(locale)}: () => import("./locale/messages.${locale}.json").then((module) => readTranslations(module.default))`)
    .join(",\n");
  const runtimeLocaleType = runtimeLocales.length > 0 ? "keyof typeof loaders" : "never";
  const supportedLocales = [...defaultLocales, ...runtimeLocales].map((locale) => JSON.stringify(locale)).join(" | ");
  const requestedChecks = [...defaultLocales, ...runtimeLocales]
    .map((locale) => `requested === ${JSON.stringify(locale)}`)
    .join(" || ");

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
    throw new SchematicsException("Could not find build.options.browser or build.options.main in angular.json.");
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

function findDefaultApplicationProject(workspace: AngularWorkspace): string {
  const projects = Object.entries(workspace.projects ?? {});
  const application = projects.find(([, project]) => project.projectType === "application") ?? projects[0];

  if (!application) {
    throw new SchematicsException("No Angular application project was found.");
  }

  return application[0];
}

function readJson<T>(tree: Tree, path: string): T {
  return JSON.parse(readText(tree, path)) as T;
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
