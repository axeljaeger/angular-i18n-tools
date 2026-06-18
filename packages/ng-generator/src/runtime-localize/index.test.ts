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

    expect(angularJson.projects.app.architect.build.options.polyfills).toEqual(["@angular/localize/init", "zone.js"]);
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

async function runSchematic(options: Record<string, unknown> = {}): Promise<UnitTestTree> {
  const tree = new UnitTestTree(new EmptyTree());

  tree.create("angular.json", JSON.stringify(createWorkspace(), null, 2));
  tree.create(
    "src/main.ts",
    'import { bootstrapApplication } from "@angular/platform-browser";\nimport { AppComponent } from "./app/app.component";\n\nbootstrapApplication(AppComponent).catch((error: unknown) => console.error(error));\n'
  );

  return runner.runSchematic("runtime-localize", options, tree);
}

function createWorkspace(): unknown {
  return {
    version: 1,
    projects: {
      app: {
        projectType: "application",
        root: "",
        sourceRoot: "src",
        architect: {
          build: {
            builder: "@angular-devkit/build-angular:application",
            options: {
              browser: "src/main.ts",
              polyfills: ["zone.js"]
            }
          }
        }
      }
    }
  };
}
