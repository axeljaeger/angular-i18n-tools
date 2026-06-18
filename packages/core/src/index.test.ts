import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  buildTree,
  compareTranslations,
  createCatalog,
  createRenameEdits,
  findDuplicateIds,
  findReferences,
  getCatalogDiagnostics,
  isIgnoredWorkspacePath,
  parseLocalizationIds,
  scanFile,
  scanJsonTranslationFile,
  scanTemplateFile,
  scanTypeScriptFile
} from "./index";

describe("parseLocalizationIds", () => {
  it("finds custom Angular localization IDs", () => {
    expect(parseLocalizationIds('<button i18n="Button@@settingsDialog.applyButton">Apply</button>')).toEqual([
      "settingsDialog.applyButton"
    ]);
  });
});

describe("scanTemplateFile", () => {
  it("finds template i18n custom IDs", () => {
    expect(
      scanTemplateFile({
        path: "app.component.html",
        content: '<h1 i18n="Title@@home.title">Home</h1>\n<button i18n-title="Tooltip@@home.tooltip"></button>'
      })
    ).toMatchObject([
      { id: "home.title", kind: "template", sourceFile: "app.component.html", line: 1, column: 5 },
      { id: "home.tooltip", kind: "template", sourceFile: "app.component.html", line: 2, column: 9 }
    ]);
  });
});

describe("scanTypeScriptFile", () => {
  it("finds $localize custom IDs", () => {
    expect(
      scanTypeScriptFile({
        path: "app.component.ts",
        content: 'const title = $localize`:Application title@@app.title:Localization tooling sample`;'
      })
    ).toMatchObject([{ id: "app.title", kind: "localize", sourceFile: "app.component.ts", line: 1, column: 15 }]);
  });
});

describe("scanJsonTranslationFile", () => {
  it("finds runtime translation keys with locale from the file name", () => {
    expect(
      scanJsonTranslationFile({
        path: "src/locale/messages.de.json",
        content: '{\n  "locale": "de",\n  "translations": {\n    "app.title": "Beispiel"\n  }\n}'
      })
    ).toMatchObject([
      { id: "app.title", kind: "translation", locale: "de", sourceFile: "src/locale/messages.de.json", line: 4 }
    ]);
  });
});

describe("findReferences", () => {
  it("returns all source and translation references for an ID", () => {
    const references = findReferences(
      createCatalog([
        { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
        { path: "b.ts", content: 'const title = $localize`:Title@@home.title:Home`;' },
        { path: "messages.de.json", content: '{ "home.title": "Startseite" }' }
      ]),
      "home.title"
    );

    expect(references.map((entry) => entry.kind)).toEqual(["template", "localize", "translation"]);
  });
});

describe("createRenameEdits", () => {
  it("creates exact replacement edits for supported file types", () => {
    const files = [
      { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
      { path: "b.ts", content: 'const title = $localize`:Title@@home.title:Home`;' },
      { path: "messages.de.json", content: '{ "home.title": "Startseite" }' }
    ];

    const edits = createRenameEdits(files, "home.title", "home.heading");

    expect(edits.map((edit) => edit.sourceFile)).toEqual(["a.html", "b.ts", "messages.de.json"]);
    expect(
      files.map((file) =>
        applyTextEdits(
          file.content,
          edits.filter((edit) => edit.sourceFile === file.path)
        )
      )
    ).toEqual([
      '<h1 i18n="Title@@home.heading">Home</h1>',
      "const title = $localize`:Title@@home.heading:Home`;",
      '{ "home.heading": "Startseite" }'
    ]);
  });
});

describe("createCatalog", () => {
  it("separates source and translation entries", () => {
    const catalog = createCatalog([
      {
        path: "app.component.html",
        content: '<h1 i18n="Title@@home.title">Home</h1>'
      },
      {
        path: "messages.de.json",
        content: '{ "home.title": "Startseite" }'
      }
    ]);

    expect(catalog.sourceEntries).toHaveLength(1);
    expect(catalog.translationEntries).toHaveLength(1);
    expect(catalog.entries).toHaveLength(2);
  });
});

describe("scanFile", () => {
  it("ignores generated output paths", () => {
    expect(
      scanFile({
        path: "dist/app.component.html",
        content: '<h1 i18n="Title@@home.title">Home</h1>'
      })
    ).toEqual([]);
  });
});

describe("findDuplicateIds", () => {
  it("returns duplicated source IDs and ignores translation entries", () => {
    const duplicates = findDuplicateIds(
      createCatalog([
        { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
        { path: "b.ts", content: 'const title = $localize`:Title@@home.title:Home`;' },
        { path: "messages.de.json", content: '{ "home.title": "Startseite" }' }
      ])
    );

    expect([...duplicates.keys()]).toEqual(["home.title"]);
  });
});

describe("compareTranslations", () => {
  it("reports missing and extra translation IDs by locale", () => {
    const coverage = compareTranslations(
      createCatalog([
        { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
        { path: "b.html", content: '<p i18n="Intro@@home.intro">Intro</p>' },
        {
          path: "messages.de.json",
          content: '{ "home.title": "Startseite", "home.extra": "Extra" }'
        }
      ])
    );

    expect(coverage).toEqual([{ locale: "de", missing: ["home.intro"], extra: ["home.extra"] }]);
  });
});

describe("getCatalogDiagnostics", () => {
  it("reports duplicate, missing, and extra catalog issues", () => {
    const diagnostics = getCatalogDiagnostics(createCatalog(createBrokenCatalogFixture()));

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "duplicate-source-id", id: "home.title", entry: expect.any(Object) }),
        expect.objectContaining({ kind: "missing-translation", id: "home.intro", locale: "de" }),
        expect.objectContaining({ kind: "extra-translation", id: "home.extra", locale: "de", entry: expect.any(Object) })
      ])
    );
  });

  it("keeps diagnostic locations on entries that can be edited", () => {
    const diagnostics = getCatalogDiagnostics(createCatalog(createBrokenCatalogFixture()));
    const entryDiagnostics = diagnostics.filter((diagnostic) => diagnostic.entry);

    expect(entryDiagnostics).toHaveLength(4);
    expect(
      entryDiagnostics.map((diagnostic) => ({
        kind: diagnostic.kind,
        file: diagnostic.entry?.sourceFile,
        rangeText: diagnostic.entry?.id
      }))
    ).toEqual(
      expect.arrayContaining([
        { kind: "duplicate-source-id", file: "a.html", rangeText: "home.title" },
        { kind: "duplicate-source-id", file: "b.ts", rangeText: "home.title" },
        { kind: "missing-translation", file: "c.html", rangeText: "home.intro" },
        { kind: "extra-translation", file: "messages.de.json", rangeText: "home.extra" }
      ])
    );
  });
});

describe("buildTree", () => {
  it("builds a hierarchy from source IDs", () => {
    const tree = buildTree(
      createCatalog([
        { path: "a.html", content: '<h1 i18n="Title@@settingsDialog.title">Settings</h1>' },
        { path: "a.html", content: '<button i18n="Apply@@settingsDialog.applyButton">Apply</button>' },
        { path: "messages.de.json", content: '{ "settingsDialog.title": "Einstellungen" }' }
      ])
    );

    expect(tree).toMatchObject([
      {
        name: "settingsDialog",
        children: [{ name: "applyButton" }, { name: "title" }]
      }
    ]);
  });
});

describe("isIgnoredWorkspacePath", () => {
  it("identifies ignored workspace output folders", () => {
    expect(isIgnoredWorkspacePath("apps/sample-angular/storybook-static/index.html")).toBe(true);
    expect(isIgnoredWorkspacePath("apps/sample-angular/src/app.component.html")).toBe(false);
  });
});

function createBrokenCatalogFixture() {
  return [
    { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
    { path: "b.ts", content: 'const title = $localize`:Title@@home.title:Home`;' },
    { path: "c.html", content: '<p i18n="Intro@@home.intro">Intro</p>' },
    {
      path: "messages.de.json",
      content: '{ "home.title": "Startseite", "home.extra": "Extra" }'
    }
  ];
}
