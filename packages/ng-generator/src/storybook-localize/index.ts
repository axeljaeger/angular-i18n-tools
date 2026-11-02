import { posix } from "node:path";
import { branchAndMerge, chain, SchematicsException, type Rule, type Tree, type SchematicContext } from "@angular-devkit/schematics";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks/index.js";
import { addLocalizeDependency, configureRuntimeProject, discoverLocales, findApplications, findProjects, writeRuntimeCatalogSetup, readJson, type AngularProject, type RuntimeLocalizeOptions } from "../runtime-localize/index.js";
import { selectProjects } from "../project-selection.js";
import { addArrayEntry, addHelperImport, mergeConfigProperty, requireAngularFramework, FrameworkDetectionError, exportsTranslationLoader } from "./config.js";

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
  return async tree => {
    const apps = findProjects(tree).filter(app => {
      const files = storybookFiles(tree, app.project);
      if (!files) return false;
      try { requireAngularFramework(tree.read(files.main)!.toString(), files.main); }
      catch (error) {
        // Keep unresolved configurations visible so selection yields a useful diagnostic.
        if (error instanceof FrameworkDetectionError && error.category === "non-angular") return false;
      }
      return true;
    });
    if (apps.length === 0) throw new SchematicsException("No Angular Storybook projects found. Applications and libraries are supported, including non-buildable libraries. Check target options.configDir or <project root>/.storybook/main.ts and framework @storybook/angular(-vite). Initialize Storybook first if needed, then rerun this command.");
    const selected = await selectProjects(apps, { ...options, selectionLabel: "Angular Storybook projects" }, tree.exists("nx.json"));
    const directories = selected.map(name => storybookFiles(tree, apps.find(app => app.projectName === name)!.project)!.directory);
    if (new Set(directories).size !== directories.length) throw new SchematicsException("Selected projects share a Storybook configuration. Select one project for each Storybook.");
    let install = false;
    return branchAndMerge(chain([
      ...selected.map(name => (tree: Tree, context: SchematicContext) => {
        const app = findProjects(tree).find(candidate => candidate.projectName === name)!;
        const files = storybookFiles(tree, app.project)!;
        try { requireAngularFramework(tree.read(files.main)!.toString(), files.main); }
        catch (error) { throw new SchematicsException(`Project "${name}" (${app.project.projectType ?? "project"}, root: ${app.project.root || "."}):\n${error instanceof Error ? error.message : String(error)}`); }
        const sourceRoot = app.project.sourceRoot ?? posix.join(app.project.root ?? "", "src");
        const application = findApplications(tree).some(candidate => candidate.projectName === name);
        const sourceLoader = posix.join(sourceRoot, "locale-loader.ts");
        const loader = application || tree.exists(sourceLoader) ? sourceLoader : posix.join(files.directory, "locale-loader.ts");
        if (!tree.exists(loader)) {
          if (application) {
            install = configureRuntimeProject(tree, context, { ...options, project: name }) || install;
          } else {
            const setup = discoverLocales(tree, app.project, options);
            writeRuntimeCatalogSetup(tree, setup, loader);
            if (setup.runtimeLocales.length === 0) context.logger.info(`Project "${name}": no target languages found. Only the source language is configured; add runtime JSON catalogs or i18n.locales references (shared catalogs are supported).`);
          }
        } else if (!exportsTranslationLoader(tree.read(loader)!.toString())) {
          throw new SchematicsException(`Existing ${loader} is not the supported runtime loader. It was not overwritten; use the manual Storybook setup guide.`);
        }
        install = addLocalizeDependency(tree, app.project.root ?? "") || install;
        const localeSetup = discoverLocales(tree, findProjects(tree).find(candidate => candidate.projectName === name)!.project);
        const locales = [localeSetup.sourceLocale, ...localeSetup.runtimeLocales];
        const helperPath = posix.join(files.directory, "angular-i18n-tools.ts");
        if (tree.exists(helperPath) && !tree.read(helperPath)!.toString().startsWith("// Generated by Angular i18n Tools")) throw new SchematicsException(`${helperPath} already exists and was not generated by this tool. It was not overwritten.`);
        const loaderImport = posix.relative(files.directory, loader.replace(/\.ts$/, ""));
        const helper = `// Generated by Angular i18n Tools. Rerun setup after changing configured languages.\nimport "@angular/localize/init";\nimport { loadTranslationsForLocale } from ${JSON.stringify(loaderImport.startsWith(".") ? loaderImport : `./${loaderImport}`)};\n\nconst locales = ${JSON.stringify(locales)};\nexport const angularI18nGlobalTypes = { locale: { name: "Locale", description: "Locale used when the Storybook preview is loaded.", defaultValue: ${JSON.stringify(localeSetup.sourceLocale)}, toolbar: { icon: "globe", items: locales.map(value => ({ value, title: value })), showName: true } } };\nexport const angularI18nInitialGlobals = { locale: ${JSON.stringify(localeSetup.sourceLocale)} };\nexport async function angularI18nLoader(context: { globals: Record<string, unknown> }): Promise<void> {\n  const locale = context.globals.locale;\n  if (typeof locale === "string" && locales.includes(locale)) await loadTranslationsForLocale(locale as Parameters<typeof loadTranslationsForLocale>[0]);\n}\n`;
        if (tree.exists(helperPath)) tree.overwrite(helperPath, helper); else tree.create(helperPath, helper);
        tree.overwrite(files.main, addArrayEntry(tree.read(files.main)!.toString(), files.main, "addons", '"@angular-i18n-tools/storybook-addon"', true));
        let preview = tree.exists(files.preview) ? tree.read(files.preview)!.toString() : "const preview = {};\nexport default preview;\n";
        preview = addHelperImport(preview);
        preview = addArrayEntry(preview, files.preview, "loaders", "angularI18nLoader");
        preview = mergeConfigProperty(preview, files.preview, "globalTypes", "angularI18nGlobalTypes");
        preview = mergeConfigProperty(preview, files.preview, "initialGlobals", "angularI18nInitialGlobals");
        if (tree.exists(files.preview)) tree.overwrite(files.preview, preview); else tree.create(files.preview, preview);
        install = addAddonDependency(tree, app.project.root ?? "") || install;
        return tree;
      }),
      (tree, context) => {
        if (install && !options.skipInstall) context.addTask(new NodePackageInstallTask());
        return tree;
      }
    ]));
  };
}
