import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { EmptyTree } from "@angular-devkit/schematics";
import { describe, expect, it } from "vitest";

const runner = new SchematicTestRunner(
  "@angular-i18n-tools/ng-generator",
  new URL("../../collection.json", import.meta.url).pathname
);

describe("runtime-localize schematic", () => {
  it("adds runtime localization files and Angular CLI configuration", async () => {
    const tree = await runSchematic();
    const angularJson = JSON.parse(tree.readContent("angular.json"));

    expect(angularJson.projects.app.architect.build.options.polyfills).toEqual(["@angular/localize/init"]);
    expect(angularJson.projects.app.architect["extract-i18n"].builder).toBe("@angular/build:extract-i18n");
    expect(angularJson.projects.app.architect["extract-i18n"].options).toMatchObject({
      buildTarget: "app:build",
      format: "json",
      outFile: "messages.en-US.json",
      outputPath: "src/locale"
    });
    expect(tree.exists("src/locale-loader.ts")).toBe(true);
    expect(tree.readContent("src/locale/messages.de.json")).toContain('"locale": "de"');
    expect(tree.readContent("src/locale/messages.fr.json")).toContain('"locale": "fr"');
    expect(tree.readContent("src/main.ts")).toContain(
      "loadRuntimeTranslations().then(() => bootstrapApplication(AppComponent)).catch"
    );
  });

  it("preserves Zone.js when adding localization to an existing zone-based app", async () => {
    const tree = await runSchematic({}, ["zone.js"], "@angular-devkit/build-angular:application");
    const angularJson = JSON.parse(tree.readContent("angular.json"));

    expect(angularJson.projects.app.architect.build.options.polyfills).toEqual(["@angular/localize/init", "zone.js"]);
    expect(angularJson.projects.app.architect["extract-i18n"].builder).toBe("@angular-devkit/build-angular:extract-i18n");
  });

  it("supports custom project, source locale, runtime locales, and query parameter", async () => {
    const tree = await runSchematic({
      project: "app",
      sourceLocale: "en",
      locales: ["es"],
      queryParam: "lang"
    });
    const loader = tree.readContent("src/locale-loader.ts");

    expect(tree.exists("src/locale/messages.en.json")).toBe(true);
    expect(tree.exists("src/locale/messages.es.json")).toBe(true);
    expect(loader).toContain('get("lang")');
    expect(loader).toContain('messages.es.json');
  });
});

async function runSchematic(options: Record<string, unknown> = {}, polyfills: string[] = [], builder = "@angular/build:application"): Promise<UnitTestTree> {
  const tree = new UnitTestTree(new EmptyTree());

  tree.create("angular.json", JSON.stringify(createWorkspace(polyfills, builder), null, 2));
  tree.create(
    "src/main.ts",
    'import { bootstrapApplication } from "@angular/platform-browser";\nimport { AppComponent } from "./app/app.component";\n\nbootstrapApplication(AppComponent).catch((error: unknown) => console.error(error));\n'
  );

  return runner.runSchematic("runtime-localize", options, tree);
}

function createWorkspace(polyfills: string[], builder: string): unknown {
  return {
    version: 1,
    projects: {
      app: {
        projectType: "application",
        root: "",
        sourceRoot: "src",
        architect: {
          build: {
            builder,
            options: {
              browser: "src/main.ts",
              polyfills
            }
          }
        }
      }
    }
  };
}

describe("Nx project.json workspaces", () => {
  function workspace(executor = "@nx/angular:application", name = "shop"): UnitTestTree {
    const tree = new UnitTestTree(new EmptyTree());
    tree.create("nx.json", "{}");
    tree.create(`apps/${name}/project.json`, JSON.stringify({
      name, projectType: "application", sourceRoot: `apps/${name}/src`,
      tags: ["demo"], targets: {
        build: { executor, options: { browser: `apps/${name}/src/main.ts`, polyfills: ["zone.js"] } },
        serve: { executor: "@nx/angular:dev-server" }
      }
    }));
    tree.create(`apps/${name}/src/main.ts`, 'import { bootstrapApplication } from "@angular/platform-browser";\nbootstrapApplication(AppComponent);\n');
    return tree;
  }

  it.each([
    ["@nx/angular:application", "@nx/angular:extract-i18n"],
    ["@angular/build:application", "@angular/build:extract-i18n"],
    ["@angular-devkit/build-angular:browser", "@angular-devkit/build-angular:extract-i18n"]
  ])("configures %s without creating angular.json", async (executor, extraction) => {
    const tree = await runner.runSchematic("runtime-localize", {}, workspace(executor));
    const project = JSON.parse(tree.readContent("apps/shop/project.json"));
    expect(project.targets.build.options.polyfills).toEqual(["@angular/localize/init", "zone.js"]);
    expect(project.targets["extract-i18n"]).toEqual({ executor: extraction, options: {
      buildTarget: "shop:build", format: "json", outFile: "messages.en-US.json", outputPath: "apps/shop/src/locale"
    } });
    expect(project.tags).toEqual(["demo"]);
    expect(project.targets.serve.executor).toBe("@nx/angular:dev-server");
    expect(tree.exists("angular.json")).toBe(false);
    expect(tree.exists("apps/shop/src/locale/messages.de.json")).toBe(true);
    expect(tree.readContent("apps/shop/src/main.ts")).toContain("loadRuntimeTranslations().then(() => bootstrapApplication(AppComponent))");
  });

  it("requires selection when more than one Angular app exists", async () => {
    const tree = workspace();
    const second = workspace("@angular/build:application", "admin");
    for (const path of second.files.filter(path => path !== "/nx.json")) tree.create(path, second.readContent(path));
    await expect(runner.runSchematic("runtime-localize", {}, tree)).rejects.toThrow("--project");
    const result = await runner.runSchematic("runtime-localize", { project: "admin" }, tree);
    expect(result.exists("apps/admin/src/locale-loader.ts")).toBe(true);
    expect(result.exists("apps/shop/src/locale-loader.ts")).toBe(false);
  });

  it("skips non-Angular apps and libraries and ignores installed project files", async () => {
    const tree = workspace();
    tree.create("libs/shared/project.json", JSON.stringify({ name: "lib", projectType: "library" }));
    tree.create("apps/api/project.json", JSON.stringify({ name: "api", projectType: "application", targets: { build: { executor: "@nx/js:tsc" } } }));
    tree.create("node_modules/dependency/project.json", "invalid JSON");
    expect((await runner.runSchematic("runtime-localize", {}, tree)).exists("apps/shop/src/locale-loader.ts")).toBe(true);
  });

  it("preserves catalogs and does not wrap bootstrap or polyfills twice on rerun", async () => {
    let tree = await runner.runSchematic("runtime-localize", {}, workspace());
    tree.overwrite("apps/shop/src/locale/messages.de.json", '{"locale":"de","translations":{"hello":"Hallo"}}');
    tree = await runner.runSchematic("runtime-localize", {}, tree);
    expect(tree.readContent("apps/shop/src/locale/messages.de.json")).toContain("Hallo");
    expect(tree.readContent("apps/shop/src/main.ts").match(/loadRuntimeTranslations\(\)/g)).toHaveLength(1);
    expect(JSON.parse(tree.readContent("apps/shop/project.json")).targets.build.options.polyfills).toEqual(["@angular/localize/init", "zone.js"]);
  });

  it("rejects a missing or unsupported project without modifying files", async () => {
    const tree = workspace();
    const files = [...tree.files];
    await expect(runner.runSchematic("runtime-localize", { project: "missing" }, tree)).rejects.toThrow("not found");
    expect(tree.files).toEqual(files);
  });
});


describe("workspace dependency and adapter handling", () => {
  it("adds a matching localize dependency and schedules installation", async () => {
    const tree = await runSchematic();
    tree.create("package.json", JSON.stringify({ dependencies: { "@angular/core": "~22.2.4" } }));
    const result = await runner.runSchematic("runtime-localize", {}, tree);
    expect(JSON.parse(result.readContent("package.json")).devDependencies["@angular/localize"]).toBe("~22.2.4");
    expect(runner.tasks.map(task => task.name)).toContain("node-package");
  });

  it("preserves an existing localize dependency", async () => {
    const tree = await runSchematic();
    tree.create("package.json", JSON.stringify({ devDependencies: { "@angular/localize": "22.2.4" } }));
    const result = await runner.runSchematic("runtime-localize", {}, tree);
    expect(JSON.parse(result.readContent("package.json")).devDependencies["@angular/localize"]).toBe("22.2.4");
    expect(runner.tasks).toHaveLength(0);
  });

  it("uses application dependencies in a package-based workspace", async () => {
    const tree = await runSchematic();
    const config = JSON.parse(tree.readContent("angular.json"));
    config.projects.app.root = "apps/app";
    tree.overwrite("angular.json", JSON.stringify(config));
    tree.create("package.json", '{"private":true}');
    tree.create("apps/app/package.json", JSON.stringify({ dependencies: { "@angular/core": "22.2.4" } }));
    const result = await runner.runSchematic("runtime-localize", {}, tree);
    expect(JSON.parse(result.readContent("apps/app/package.json")).devDependencies["@angular/localize"]).toBe("22.2.4");
    expect(JSON.parse(result.readContent("package.json")).devDependencies).toBeUndefined();
  });

  it("prefers project.json when Nx also exposes a virtual angular.json", async () => {
    const tree = await runSchematic();
    tree.create("nx.json", "{}");
    tree.create("project.json", JSON.stringify({ name: "app", projectType: "application", root: "", sourceRoot: "src", targets: {
      build: { executor: "@nx/angular:application", options: { browser: "src/main.ts" } }
    } }));
    const result = await runner.runSchematic("runtime-localize", {}, tree);
    expect(JSON.parse(result.readContent("project.json")).targets["extract-i18n"].executor).toBe("@nx/angular:extract-i18n");
  });
});
