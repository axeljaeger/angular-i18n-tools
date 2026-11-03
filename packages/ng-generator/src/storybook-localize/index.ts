import { posix } from "node:path";
import { branchAndMerge, chain, SchematicsException, type Rule, type Tree, type SchematicContext } from "@angular-devkit/schematics";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks/index.js";
import { addLocalizeDependency, configureRuntimeProject, discoverLocales, findApplications, findProjects, writeRuntimeCatalogSetup, readJson, type AngularProject, type RuntimeLocalizeOptions } from "../runtime-localize/index.js";
import { selectProjects } from "../project-selection.js";
import { addArrayEntry, configurePreview, requireAngularFramework, FrameworkDetectionError, exportsTranslationLoader } from "./config.js";
import { setupStep } from "../diagnostics.js";

function storybookFiles(tree: Tree, project: AngularProject): { main: string; preview: string; directory: string } | undefined {
  const targets = project.targets ?? project.architect ?? {};
  const configDirs = Object.values(targets)
    .filter(target => /storybook/.test(target.executor ?? target.builder ?? "") || typeof target.options?.configDir === "string")
    .map(target => target.options?.configDir).filter((path): path is string => typeof path === "string");
  const directories = [...new Set([
    ...configDirs.flatMap(configDir => [configDir, posix.join(project.root ?? "", configDir)]),
    posix.join(project.root ?? "", ".storybook")
  ])];
  for (const directory of directories) {
    const main = ["ts", "mts", "js", "mjs"].map(extension => posix.join(directory, `main.${extension}`)).find(path => tree.exists(path));
    if (!main) continue;
    const preview = ["ts", "mts", "js", "mjs"].map(extension => posix.join(directory, `preview.${extension}`)).find(path => tree.exists(path)) ?? posix.join(directory, "preview.ts");
    return { main, preview, directory };
  }
  return undefined;
}

function addAddonDependency(tree: Tree, root: string): boolean {
  type Package = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const packages = [...new Set([posix.join(root, "package.json"), "package.json"])].filter(path => tree.exists(path))
    .map(path => ({ path, pkg: readJson<Package>(tree, path) }));
  const has = (pkg: Package, dependency: string) => Boolean(pkg.dependencies?.[dependency] || pkg.devDependencies?.[dependency]);
  if (packages.some(({ pkg }) => has(pkg, "@angular-i18n-tools/storybook-addon"))) return false;
  const owner = packages.find(({ pkg }) => ["storybook", "@storybook/angular", "@storybook/angular-vite"].some(dependency => has(pkg, dependency)))
    ?? packages.find(({ pkg }) => has(pkg, "@angular/core"))
    ?? packages.find(candidate => candidate.path === "package.json");
  if (!owner) throw new SchematicsException("Expected a workspace or project package.json declaring Storybook or Angular dependencies. No files were written.");
  owner.pkg.devDependencies ??= {};
  owner.pkg.devDependencies["@angular-i18n-tools/storybook-addon"] = "^0.0.2";
  tree.overwrite(owner.path, JSON.stringify(owner.pkg, null, 2) + "\n");
  return true;
}

export function storybookLocalize(options: RuntimeLocalizeOptions): Rule {
  return async (tree, setupContext) => {
    const trace = options.verbose ? (step: string) => setupContext.logger.info(`[setup] ${step}`) : undefined;
    const apps = setupStep("Discover Angular/Nx projects (angular.json, project.json, package.json#nx)", () => findProjects(tree), trace).filter(app => {
      const files = storybookFiles(tree, app.project);
      if (!files) { trace?.(`Skip project "${app.projectName}" (${app.project.root || "."}): no Storybook main config found`); return false; }
      trace?.(`Discovered project "${app.projectName}" (${app.project.projectType ?? "project"}, root: ${app.project.root || "."}); main: ${files.main}; preview: ${files.preview}`);
      try { requireAngularFramework(tree.read(files.main)!.toString(), files.main); }
      catch (error) {
        // Keep unresolved configurations visible so selection yields a useful diagnostic.
        if (error instanceof FrameworkDetectionError && error.category === "non-angular") { trace?.(`Skip "${app.projectName}": non-Angular framework`); return false; }
        trace?.(`Keep "${app.projectName}" selectable: main config requires a diagnostic after selection`);
      }
      return true;
    });
    if (apps.length === 0) throw new SchematicsException("No Angular Storybook projects found. Applications and libraries are supported, including non-buildable libraries. Projects must be declared in angular.json, project.json, or package.json#nx. Check target options.configDir or <project root>/.storybook/main.ts and framework @storybook/angular(-vite). Initialize Storybook first if needed, then rerun this command.");
    const selected = await selectProjects(apps, { ...options, selectionLabel: "Angular Storybook projects" }, tree.exists("nx.json"));
    trace?.(`Selected projects: ${selected.join(", ")}`);
    const directories = selected.map(name => storybookFiles(tree, apps.find(app => app.projectName === name)!.project)!.directory);
    if (new Set(directories).size !== directories.length) throw new SchematicsException("Selected projects share a Storybook configuration. Select one project for each Storybook.");
    let install = false;
    return branchAndMerge(chain([
      ...selected.map(name => (tree: Tree, context: SchematicContext) => setupStep(`Project "${name}" (${apps.find(app => app.projectName === name)!.project.projectType ?? "project"}, root: ${apps.find(app => app.projectName === name)!.project.root || "."})`, () => {
        const app = findProjects(tree).find(candidate => candidate.projectName === name)!;
        const files = storybookFiles(tree, app.project)!;
        const step = <T>(action: string, path: string, operation: () => T): T => setupStep(`${action}: ${path}`, operation, trace);
        step("Detect Angular Storybook framework", files.main, () => requireAngularFramework(tree.read(files.main)!.toString(), files.main));
        const sourceRoot = app.project.sourceRoot ?? posix.join(app.project.root ?? "", "src");
        const application = findApplications(tree).some(candidate => candidate.projectName === name);
        const sourceLoader = posix.join(sourceRoot, "locale-loader.ts");
        const loader = application || tree.exists(sourceLoader) ? sourceLoader : posix.join(files.directory, "locale-loader.ts");
        if (!tree.exists(loader)) {
          if (application) {
            install = step("Prepare application runtime localization", sourceRoot, () => configureRuntimeProject(tree, context, { ...options, project: name })) || install;
          } else {
            const setup = step("Discover source/target locales and runtime JSON catalogs", sourceRoot, () => discoverLocales(tree, app.project, options));
            step("Generate Storybook-local locale loader", loader, () => writeRuntimeCatalogSetup(tree, setup, loader));
            if (setup.runtimeLocales.length === 0) context.logger.info(`Project "${name}": no target languages found. Only the source language is configured; add runtime JSON catalogs or i18n.locales references (shared catalogs are supported).`);
          }
        } else if (!exportsTranslationLoader(tree.read(loader)!.toString())) {
          throw new SchematicsException(`Existing ${loader} is not the supported runtime loader. It was not overwritten; use the manual Storybook setup guide.`);
        }
        install = step("Check Angular localize dependency", app.project.root || ".", () => addLocalizeDependency(tree, app.project.root ?? "")) || install;
        const localeSetup = step("Discover toolbar locales", sourceRoot, () => discoverLocales(tree, findProjects(tree).find(candidate => candidate.projectName === name)!.project));
        const locales = [localeSetup.sourceLocale, ...localeSetup.runtimeLocales];
        const helperPath = posix.join(files.directory, "angular-i18n-tools.ts");
        if (tree.exists(helperPath) && !tree.read(helperPath)!.toString().startsWith("// Generated by Angular i18n Tools")) throw new SchematicsException(`${helperPath} already exists and was not generated by this tool. It was not overwritten.`);
        const loaderImport = posix.relative(files.directory, loader.replace(/\.ts$/, ""));
        const helper = `// Generated by Angular i18n Tools. Rerun setup after changing configured languages.\nimport "@angular/localize/init";\nimport { loadTranslationsForLocale } from ${JSON.stringify(loaderImport.startsWith(".") ? loaderImport : `./${loaderImport}`)};\n\nconst locales = ${JSON.stringify(locales)};\nexport const angularI18nGlobalTypes = { locale: { name: "Locale", description: "Locale used when the Storybook preview is loaded.", defaultValue: ${JSON.stringify(localeSetup.sourceLocale)}, toolbar: { icon: "globe", items: locales.map(value => ({ value, title: value })), showName: true } } };\nexport const angularI18nInitialGlobals = { locale: ${JSON.stringify(localeSetup.sourceLocale)} };\nexport async function angularI18nLoader(context: { globals: Record<string, unknown> }): Promise<void> {\n  const locale = context.globals.locale;\n  if (typeof locale === "string" && locales.includes(locale)) await loadTranslationsForLocale(locale as Parameters<typeof loadTranslationsForLocale>[0]);\n}\n`;
        if (tree.exists(helperPath)) tree.overwrite(helperPath, helper); else tree.create(helperPath, helper);
        tree.overwrite(files.main, step("Update main addons", files.main, () => addArrayEntry(tree.read(files.main)!.toString(), files.main, "addons", '"@angular-i18n-tools/storybook-addon"', true)));
        let preview = tree.exists(files.preview) ? tree.read(files.preview)!.toString() : "const preview = {};\nexport default preview;\n";
        preview = step("Update preview loaders and locale globals", files.preview, () => configurePreview(preview, files.preview));
        if (tree.exists(files.preview)) tree.overwrite(files.preview, preview); else tree.create(files.preview, preview);
        install = step("Check Storybook addon dependency", app.project.root || ".", () => addAddonDependency(tree, app.project.root ?? "")) || install;
        return tree;
      }, trace, true)),
      (tree, context) => {
        if (install && !options.skipInstall) context.addTask(new NodePackageInstallTask());
        return tree;
      }
    ]));
  };
}
