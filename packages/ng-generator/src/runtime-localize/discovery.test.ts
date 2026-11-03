import { EmptyTree } from "@angular-devkit/schematics";
import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { describe, expect, it } from "vitest";
import { findProjects } from "./index";

const runner = new SchematicTestRunner("setup", new URL("../../collection.json", import.meta.url).pathname);
function fixture() {
  const tree = new UnitTestTree(new EmptyTree());
  tree.create("nx.json", "{}");
  tree.create("package.json", '{"name":"workspace","private":true,"dependencies":{"@angular/core":"22.2.4"}}');
  return tree;
}

describe("Nx package.json project discovery", () => {
  it("uses scoped package names and nx.name overrides, including empty nx objects", () => {
    const tree = fixture();
    tree.create("libs/ui/package.json", '{"name":"@example/ui","nx":{}}');
    tree.create("libs/forms/package.json", '{"name":"@example/forms","nx":{"name":"forms","sourceRoot":"libs/forms/source","projectType":"library"}}');
    expect(findProjects(tree).map(({ projectName, project }) => [projectName, project.root, project.sourceRoot])).toEqual([
      ["@example/ui", "libs/ui", undefined], ["forms", "libs/forms", "libs/forms/source"]
    ]);
  });
  it("ignores unrelated packages and generated or installed project files", () => {
    const tree = fixture();
    tree.create("libs/ui/package.json", '{"name":"ui","nx":{}}');
    tree.create("libs/not-an-nx-project/package.json", '{"name":"other"}');
    for (const directory of ["node_modules", "dist", "coverage", ".cache", "storybook-static"]) {
      tree.create(`${directory}/ui/package.json`, "invalid JSON");
    }
    expect(findProjects(tree).map(project => project.projectName)).toEqual(["ui"]);
  });
  it("merges project.json overrides and target options without offering the same root twice", () => {
    const tree = fixture();
    const pkg = { name: "@example/ui", nx: { sourceRoot: "libs/ui/source", i18n: { locales: { fr: {} } }, targets: {
      storybook: { executor: "@storybook/angular-vite:start-storybook", options: { configDir: "libs/ui/.stories", port: 6006 } }
    } } };
    tree.create("libs/ui/package.json", JSON.stringify(pkg));
    tree.create("libs/ui/project.json", JSON.stringify({ name: "ui", targets: { storybook: { options: { port: 6007 } } } }));
    tree.create("angular.json", JSON.stringify({ projects: { ui: { root: "libs/ui", sourceRoot: "wrong" } } }));
    const projects = findProjects(tree);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.projectName).toBe("ui");
    expect(projects[0]!.project).toMatchObject({ sourceRoot: "libs/ui/source", i18n: pkg.nx.i18n, targets: {
      storybook: { executor: "@storybook/angular-vite:start-storybook", options: { configDir: "libs/ui/.stories", port: 6007 } }
    } });
    projects[0]!.project.i18n = { sourceLocale: "en" };
    projects[0]!.save();
    expect(JSON.parse(tree.readContent("libs/ui/package.json"))).toEqual(pkg);
    expect(JSON.parse(tree.readContent("libs/ui/project.json"))).toEqual({ name: "ui", i18n: { sourceLocale: "en" }, targets: { storybook: { options: { port: 6007 } } } });
  });
  it("rejects duplicate names at different roots", () => {
    const tree = fixture();
    for (const root of ["libs/one", "libs/two"]) tree.create(`${root}/package.json`, '{"name":"ui","nx":{}}');
    expect(() => findProjects(tree)).toThrow("Project names must be unique");
  });
  it("configures an explicit package-based Angular app in place and preserves package metadata on rerun", async () => {
    let tree = fixture();
    const pkg = { name: "@example/shop", version: "1.2.3", exports: { ".": "./src/index.ts" }, scripts: { test: "vitest" }, nx: {
      projectType: "application", sourceRoot: "apps/shop/src", tags: ["scope:shop"], i18n: { locales: { fr: {} } }, targets: {
        build: { executor: "@nx/angular:application", options: { browser: "apps/shop/src/main.ts", polyfills: ["zone.js"] } },
        serve: { executor: "@nx/angular:dev-server" }
      }
    } };
    tree.create("apps/shop/package.json", JSON.stringify(pkg));
    tree.create("apps/shop/src/main.ts", "bootstrapApplication(AppComponent);\n");
    tree = await runner.runSchematic("runtime-localize", { project: "@example/shop", skipInstall: true }, tree);
    tree = await runner.runSchematic("runtime-localize", { project: "@example/shop", skipInstall: true }, tree);
    const actual = JSON.parse(tree.readContent("apps/shop/package.json"));
    expect(actual).toMatchObject({ name: pkg.name, version: pkg.version, exports: pkg.exports, scripts: pkg.scripts,
      nx: { projectType: pkg.nx.projectType, sourceRoot: pkg.nx.sourceRoot, tags: pkg.nx.tags, targets: { serve: pkg.nx.targets.serve } }
    });
    expect(actual.nx.targets.build.options.polyfills).toEqual(["@angular/localize/init", "zone.js"]);
    expect(actual.nx.targets["extract-i18n"].options.buildTarget).toBe("@example/shop:build");
    expect(actual.nx.root).toBeUndefined();
    expect(actual.nx.name).toBeUndefined();
    expect(tree.exists("apps/shop/project.json")).toBe(false);
    expect(tree.exists("angular.json")).toBe(false);
    expect(tree.readContent("apps/shop/src/locale-loader.ts")).toContain("messages.fr.json");
    expect(JSON.parse(tree.readContent("package.json")).devDependencies["@angular/localize"]).toBe("22.2.4");
  });
});
