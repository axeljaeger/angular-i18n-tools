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
