import { EmptyTree } from "@angular-devkit/schematics";
import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const runner = new SchematicTestRunner("setup", new URL("../../collection.json", import.meta.url).pathname);
function fixture(names = ["shop"]) {
  const tree = new UnitTestTree(new EmptyTree());
  tree.create("nx.json", "{}");
  tree.create("package.json", JSON.stringify({ dependencies: { "@angular/core": "22.2.4", "@angular/localize": "22.2.4" } }));
  for (const name of names) {
    tree.create(`apps/${name}/project.json`, JSON.stringify({ name, projectType: "application", root: `apps/${name}`, sourceRoot: `apps/${name}/src`, targets: {
      build: { executor: "@nx/angular:application", options: { browser: `apps/${name}/src/main.ts` } },
      storybook: { executor: "@storybook/angular-vite:start-storybook", options: { configDir: `apps/${name}/.storybook` } }
    } }));
    tree.create(`apps/${name}/src/main.ts`, "bootstrapApplication(AppComponent);\n");
    tree.create(`apps/${name}/src/locale/messages.fr.json`, '{"locale":"fr","translations":{"greeting":"Bonjour"}}');
    tree.create(`apps/${name}/.storybook/main.ts`, 'const config = { stories: ["../src/**/*.stories.ts"], addons: ["other-addon"], framework: {name:"@storybook/angular-vite", options:{}} };\nexport default config;\n');
    tree.create(`apps/${name}/.storybook/preview.ts`, 'const preview = { loaders: [async () => ({ custom: true })], globalTypes: { theme: {} }, initialGlobals: { theme: "dark" }, parameters: { layout: "centered" } };\nexport default preview;\n');
  }
  return tree;
}

describe("Storybook setup", () => {
  it("sets up selected Storybooks and their discovered languages while preserving user settings", async () => {
    const result = await runner.runSchematic("storybook-localize", { all: true, skipInstall: true }, fixture(["shop", "admin"]));
    for (const name of ["shop", "admin"]) {
      const main = result.readContent(`apps/${name}/.storybook/main.ts`);
      const preview = result.readContent(`apps/${name}/.storybook/preview.ts`);
      expect(main).toContain("other-addon");
      expect(main).toContain('"@angular-i18n-tools/storybook-addon"');
      expect(preview).toContain("async () => ({ custom: true })");
      expect(preview).toContain('theme: "dark"');
      expect(preview).toContain('layout: "centered"');
      expect(preview).toContain("angularI18nLoader");
      expect(result.readContent(`apps/${name}/.storybook/angular-i18n-tools.ts`)).toContain('["en-US","fr"]');
      expect(result.readContent(`apps/${name}/src/locale/messages.fr.json`)).toContain("Bonjour");
      expect(result.readContent(`apps/${name}/src/main.ts`)).toContain("loadRuntimeTranslations");
      for (const source of [main, preview]) {
        expect(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true }).diagnostics).toEqual([]);
      }
    }
    expect(JSON.parse(result.readContent("package.json")).devDependencies["@angular-i18n-tools/storybook-addon"]).toBe("^0.0.2");
    expect(runner.tasks).toHaveLength(0);
  });
  it("does not duplicate integration or overwrite an existing loader on rerun", async () => {
    let result = await runner.runSchematic("storybook-localize", { skipInstall: true }, fixture());
    const path = "apps/shop/src/locale-loader.ts";
    result.overwrite(path, result.readContent(path) + "\n// custom loader extension\n");
    const mainBefore = result.readContent("apps/shop/.storybook/main.ts");
    const previewBefore = result.readContent("apps/shop/.storybook/preview.ts");
    result = await runner.runSchematic("storybook-localize", { skipInstall: true }, result);
    expect(result.readContent(path)).toContain("custom loader extension");
    expect(result.readContent("apps/shop/.storybook/main.ts")).toBe(mainBefore);
    expect(result.readContent("apps/shop/.storybook/preview.ts")).toBe(previewBefore);
  });
  it("creates a missing preview without requiring manual configuration", async () => {
    const tree = fixture();
    tree.delete("apps/shop/.storybook/preview.ts");
    const result = await runner.runSchematic("storybook-localize", { skipInstall: true }, tree);
    expect(result.readContent("apps/shop/.storybook/preview.ts")).toContain("angularI18nInitialGlobals");
  });
  it("refuses dynamic addons without writing a partial setup", async () => {
    const tree = fixture();
    tree.overwrite("apps/shop/.storybook/main.ts", 'const config = { addons: getAddons(), framework: "@storybook/angular" }; export default config;');
    await expect(runner.runSchematic("storybook-localize", {}, tree)).rejects.toThrow("dynamic addons");
    expect(tree.exists("apps/shop/src/locale-loader.ts")).toBe(false);
  });
  it("does not silently install a different Storybook framework", async () => {
    const tree = fixture();
    tree.overwrite("apps/shop/.storybook/main.ts", 'export default { framework: "@storybook/react-vite" };');
    await expect(runner.runSchematic("storybook-localize", {}, tree)).rejects.toThrow("Angular Storybook");
  });
  it("reports an actionable error when Storybook has not been initialized", async () => {
    const tree = fixture();
    tree.delete("apps/shop/.storybook/main.ts");
    await expect(runner.runSchematic("storybook-localize", {}, tree)).rejects.toThrow("Initialize Storybook first");
  });
  it("preserves an incompatible custom loader rather than overwriting it", async () => {
    const tree = fixture();
    tree.create("apps/shop/src/locale-loader.ts", "export const customLoader = true;\n");
    await expect(runner.runSchematic("storybook-localize", {}, tree)).rejects.toThrow("not overwritten");
    expect(tree.readContent("apps/shop/src/locale-loader.ts")).toContain("customLoader");
  });
});

describe("Angular library Storybooks", () => {
  function libraryFixture() {
    const tree = fixture();
    const project = { name: "ui", projectType: "library", root: "libs/ui", sourceRoot: "libs/ui/src", targets: {
      "storybook-preview": { executor: "@storybook/angular-vite:start-storybook", options: { configDir: "libs/ui/.stories-config" } }
    } };
    tree.create("libs/ui/project.json", JSON.stringify(project));
    tree.create("libs/ui/package.json", '{"name":"@example/ui","peerDependencies":{"@angular/core":"^22.0.0"}}');
    tree.create("libs/ui/src/index.ts", 'export * from "./button";\n');
    tree.create("libs/ui/src/locale/messages.fr.json", '{"locale":"fr","translations":{"button.label":"Bonjour"}}');
    tree.create("libs/ui/.stories-config/main.ts", `import { getAbsolutePath } from './paths';\nconst config = { framework: { name: getAbsolutePath('@storybook/angular-vite') }, addons: [] };\nexport default config;\n`);
    return tree;
  }
  it("includes non-buildable libraries and accepts the production getAbsolutePath form", async () => {
    const tree = libraryFixture();
    const projectBefore = tree.readContent("libs/ui/project.json");
    const packageBefore = tree.readContent("libs/ui/package.json");
    const result = await runner.runSchematic("storybook-localize", { projects: ["ui", "shop"], skipInstall: true }, tree);
    expect(result.readContent("libs/ui/.stories-config/main.ts")).toContain("getAbsolutePath('@storybook/angular-vite')");
    expect(result.readContent("libs/ui/.stories-config/main.ts")).toContain('"@angular-i18n-tools/storybook-addon"');
    expect(result.readContent("libs/ui/.stories-config/angular-i18n-tools.ts")).toContain('["en-US","fr"]');
    expect(result.exists("libs/ui/.stories-config/preview.ts")).toBe(true);
    expect(result.exists("libs/ui/.stories-config/locale-loader.ts")).toBe(true);
    expect(result.exists("libs/ui/src/locale-loader.ts")).toBe(false);
    expect(result.exists("libs/ui/src/main.ts")).toBe(false);
    expect(result.readContent("libs/ui/src/index.ts")).toBe('export * from "./button";\n');
    expect(result.readContent("libs/ui/project.json")).toBe(projectBefore);
    expect(result.readContent("libs/ui/package.json")).toBe(packageBefore);
    expect(JSON.parse(result.readContent("package.json")).devDependencies["@angular-i18n-tools/storybook-addon"]).toBe("^0.0.2");
    expect(result.readContent("libs/ui/src/locale/messages.fr.json")).toContain("Bonjour");
    expect(result.exists("apps/shop/.storybook/angular-i18n-tools.ts")).toBe(true);
  });
  it("also supports buildable ng-packagr libraries without adding app polyfills or extraction", async () => {
    const tree = libraryFixture();
    const project = JSON.parse(tree.readContent("libs/ui/project.json"));
    project.targets.build = { executor: "@nx/angular:ng-packagr-lite", options: { project: "libs/ui/ng-package.json" } };
    const before = JSON.stringify(project);
    tree.overwrite("libs/ui/project.json", before);
    const result = await runner.runSchematic("storybook-localize", { project: "ui", skipInstall: true }, tree);
    expect(result.readContent("libs/ui/project.json")).toBe(before);
    expect(result.exists("libs/ui/.stories-config/locale-loader.ts")).toBe(true);
    expect(result.exists("libs/ui/src/locale-loader.ts")).toBe(false);
  });
  it("offers a diagnostic for unresolved library framework expressions and rolls back all projects", async () => {
    const tree = libraryFixture();
    tree.overwrite("libs/ui/.stories-config/main.ts", 'export default { framework: { name: customFramework() } };');
    await expect(runner.runSchematic("storybook-localize", { all: true }, tree)).rejects.toThrow('Project "ui" (library, root: libs/ui)');
    await expect(runner.runSchematic("storybook-localize", { all: true }, tree)).rejects.toThrow("customFramework()");
    expect(tree.exists("apps/shop/src/locale-loader.ts")).toBe(false);
    expect(tree.exists("libs/ui/src/locale-loader.ts")).toBe(false);
  });
  it("does not offer known React Storybooks as Angular projects", async () => {
    const tree = libraryFixture();
    tree.overwrite("libs/ui/.stories-config/main.ts", 'export default { framework: "@storybook/react-vite" };');
    const result = await runner.runSchematic("storybook-localize", { all: true, skipInstall: true }, tree);
    expect(result.exists("apps/shop/.storybook/angular-i18n-tools.ts")).toBe(true);
    expect(result.exists("libs/ui/src/locale-loader.ts")).toBe(false);
  });
});

describe("package.json Nx library Storybooks", () => {
  function packageFixture() {
    const tree = fixture();
    for (const name of ["ui", "forms"]) {
      tree.create(`libs/${name}/package.json`, JSON.stringify({ name: `@example/${name}`, exports: { ".": "./src/index.ts" }, peerDependencies: { "@angular/core": "^22.0.0" }, nx: name === "ui" ? {} : {
        name: "forms", projectType: "library", sourceRoot: "libs/forms/source", i18n: { sourceLocale: "en", locales: { de: { translation: "shared/forms.de.json" } } },
        targets: { "preview-ui": { options: { configDir: "libs/forms/.stories" } } }
      } }));
      tree.create(`libs/${name}/${name === "ui" ? ".storybook" : ".stories"}/main.ts`, `export default { framework: { name: getAbsolutePath('@storybook/angular-vite') }, addons: [] };`);
    }
    tree.create("libs/ui/src/locale/messages.fr.json", '{"locale":"fr","translations":{"hello":"Bonjour"}}');
    tree.create("shared/forms.de.json", '{"locale":"de","translations":{"hello":"Hallo"}}');
    return tree;
  }
  it("sets up applications and package libraries together without rewriting library metadata", async () => {
    const tree = packageFixture();
    const before = ["ui", "forms"].map(name => tree.readContent(`libs/${name}/package.json`));
    const result = await runner.runSchematic("storybook-localize", { all: true, skipInstall: true }, tree);
    expect(result.exists("apps/shop/.storybook/angular-i18n-tools.ts")).toBe(true);
    expect(result.readContent("libs/ui/.storybook/angular-i18n-tools.ts")).toContain('["en-US","fr"]');
    expect(result.readContent("libs/forms/.stories/angular-i18n-tools.ts")).toContain('["en","de"]');
    expect(result.readContent("libs/forms/.stories/locale-loader.ts")).toContain("shared/forms.de.json");
    expect(result.readContent("shared/forms.de.json")).toContain("Hallo");
    for (const [index, name] of ["ui", "forms"].entries()) {
      expect(result.readContent(`libs/${name}/package.json`)).toBe(before[index]);
      expect(result.exists(`libs/${name}/project.json`)).toBe(false);
      expect(result.exists(`libs/${name}/src/main.ts`)).toBe(false);
    }
    const rerun = await runner.runSchematic("storybook-localize", { projects: ["@example/ui", "forms"], skipInstall: true }, result);
    expect(rerun.readContent("libs/ui/.storybook/main.ts")).toBe(result.readContent("libs/ui/.storybook/main.ts"));
  });
  it("reports package-based projects by name and rolls back the whole selection on failure", async () => {
    const tree = packageFixture();
    tree.overwrite("libs/forms/.stories/main.ts", "export default { framework: customFramework() };");
    await expect(runner.runSchematic("storybook-localize", { all: true, skipInstall: true }, tree)).rejects.toThrow('Project "forms" (library, root: libs/forms)');
    expect(tree.exists("libs/ui/.storybook/locale-loader.ts")).toBe(false);
    expect(tree.exists("apps/shop/src/locale-loader.ts")).toBe(false);
  });
});
