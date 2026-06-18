import { buildTree, createCatalog, getCatalogDiagnostics, type WorkspaceFile } from "@angular-i18n-tools/core";
import { describe, expect, it } from "vitest";
import {
  createAddMissingTranslationTextEdit,
  createMoveTreeNodeTextEdits,
  createRemoveTranslationTextEdit,
  createRenameGroupTextEdits,
  createRenameTextEdits,
  createRootTreeNodes,
  findEntryAtOffset,
  getDefinitionEntries,
  getFileDiagnostics,
  getNonDescendantTreeNodes,
  getProblemChildren,
  getSourceEntriesForTreeNode,
  getTranslationEntriesForTreeNode,
  isProblemGroupNode
} from "./adapter";

function applyTextEdit(content: string, edit: { range: { start: { offset: number }; end: { offset: number } }; newText: string }): string {
  return `${content.slice(0, edit.range.start.offset)}${edit.newText}${content.slice(edit.range.end.offset)}`;
}

const files: WorkspaceFile[] = [
  { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
  { path: "b.ts", content: 'const title = $localize`:Title@@home.title:Home`;' },
  {
    path: "messages.de.json",
    content: '{ "home.title": "Startseite", "home.extra": "Extra" }'
  }
];

describe("findEntryAtOffset", () => {
  it("finds an entry when the cursor is inside an ID range", () => {
    const catalog = createCatalog(files);
    const offset = files[0]!.content.indexOf("home.title") + 2;

    expect(findEntryAtOffset(catalog, "a.html", offset)).toMatchObject({
      id: "home.title",
      kind: "template"
    });
  });

  it("does not find an entry outside an ID range", () => {
    expect(findEntryAtOffset(createCatalog(files), "a.html", 0)).toBeUndefined();
  });
});

describe("createRenameTextEdits", () => {
  it("projects core rename edits from the selected entry", () => {
    const catalog = createCatalog(files);
    const entry = findEntryAtOffset(catalog, "a.html", files[0]!.content.indexOf("home.title"))!;

    expect(createRenameTextEdits(files, entry, "home.heading")).toMatchObject([
      { sourceFile: "a.html", newText: "home.heading" },
      { sourceFile: "b.ts", newText: "home.heading" },
      { sourceFile: "messages.de.json", newText: "home.heading" }
    ]);
  });
});

describe("createRenameGroupTextEdits", () => {
  it("renames source and translation IDs below a group prefix", () => {
    expect(createRenameGroupTextEdits(files, "home", "dashboard").map((edit) => edit.newText)).toEqual([
      "dashboard.title",
      "dashboard.title",
      "dashboard.title",
      "dashboard.extra"
    ]);
  });

  it("does not rename IDs in similarly named sibling groups", () => {
    const edits = createRenameGroupTextEdits(
      [
        ...files,
        { path: "c.html", content: '<p i18n="Title@@homepage.title">Home</p>' }
      ],
      "home",
      "dashboard"
    );

    expect(edits.map((edit) => edit.newText)).not.toContain("dashboardpage.title");
  });
});

describe("createMoveTreeNodeTextEdits", () => {
  it("renames a leaf under the target group", () => {
    const catalog = createCatalog([
      ...files,
      { path: "settings.html", content: '<p i18n="Name@@settingsDialog.username">Name</p>' }
    ]);
    const tree = buildTree(catalog);
    const homeNode = tree.find((node) => node.id === "home")!;
    const titleNode = homeNode.children.find((node) => node.id === "home.title")!;
    const settingsNode = tree.find((node) => node.id === "settingsDialog")!;

    expect(createMoveTreeNodeTextEdits(files, titleNode, settingsNode).map((edit) => edit.newText)).toEqual([
      "settingsDialog.title",
      "settingsDialog.title",
      "settingsDialog.title"
    ]);
  });

  it("renames a group and its descendants under the target group", () => {
    const groupFiles: WorkspaceFile[] = [
      { path: "a.html", content: '<h1 i18n="Title@@settingsDialog.accountPane.username">User</h1>' },
      { path: "b.html", content: '<h1 i18n="Title@@settingsDialog.accountPane.email">Email</h1>' },
      { path: "c.html", content: '<h1 i18n="Title@@profile.title">Profile</h1>' },
      { path: "messages.de.json", content: '{ "settingsDialog.accountPane.username": "Benutzer" }' }
    ];
    const tree = buildTree(createCatalog(groupFiles));
    const source = tree[1]!.children[0]!;
    const target = tree[0]!;

    expect(createMoveTreeNodeTextEdits(groupFiles, source, target).map((edit) => edit.newText)).toEqual([
      "profile.accountPane.username",
      "profile.accountPane.email",
      "profile.accountPane.username"
    ]);
  });

  it("does not move a group into its own descendant", () => {
    const groupFiles: WorkspaceFile[] = [
      { path: "a.html", content: '<h1 i18n="Title@@settingsDialog.accountPane.username">User</h1>' }
    ];
    const tree = buildTree(createCatalog(groupFiles));
    const source = tree[0]!;
    const target = source.children[0]!;

    expect(createMoveTreeNodeTextEdits(groupFiles, source, target)).toEqual([]);
  });

  it("creates edits for multiple selected leaves", () => {
    const multiFiles: WorkspaceFile[] = [
      { path: "a.html", content: '<h1 i18n="Title@@home.title">Home</h1>' },
      { path: "b.html", content: '<p i18n="Intro@@home.intro">Intro</p>' },
      { path: "c.html", content: '<h1 i18n="Title@@settingsDialog.title">Settings</h1>' },
      { path: "messages.de.json", content: '{ "home.title": "Startseite", "home.intro": "Intro" }' }
    ];
    const tree = buildTree(createCatalog(multiFiles));
    const homeNode = tree.find((node) => node.id === "home")!;
    const titleNode = homeNode.children.find((node) => node.id === "home.title")!;
    const introNode = homeNode.children.find((node) => node.id === "home.intro")!;
    const settingsNode = tree.find((node) => node.id === "settingsDialog")!;

    const edits = [titleNode, introNode].flatMap((source) => createMoveTreeNodeTextEdits(multiFiles, source, settingsNode));

    expect(edits.map((edit) => edit.newText)).toEqual([
      "settingsDialog.title",
      "settingsDialog.title",
      "settingsDialog.intro",
      "settingsDialog.intro"
    ]);
  });
});

describe("getNonDescendantTreeNodes", () => {
  it("removes selected children when their parent group is already selected", () => {
    const tree = buildTree(
      createCatalog([{ path: "a.html", content: '<h1 i18n="Title@@settingsDialog.accountPane.username">User</h1>' }])
    );
    const group = tree[0]!;
    const child = group.children[0]!;
    const leaf = child.children[0]!;

    expect(getNonDescendantTreeNodes([leaf, group, child]).map((node) => node.id)).toEqual(["settingsDialog"]);
  });
});

describe("getDefinitionEntries", () => {
  it("maps source IDs to translation entries", () => {
    const catalog = createCatalog(files);
    const sourceEntry = catalog.sourceEntries[0]!;

    expect(getDefinitionEntries(catalog, sourceEntry).map((entry) => entry.kind)).toEqual(["translation"]);
  });

  it("maps translation IDs to source entries", () => {
    const catalog = createCatalog(files);
    const translationEntry = catalog.translationEntries.find((entry) => entry.id === "home.title")!;

    expect(getDefinitionEntries(catalog, translationEntry).map((entry) => entry.kind)).toEqual(["template", "localize"]);
  });
});

describe("getSourceEntriesForTreeNode", () => {
  it("returns sorted source entries and excludes translations", () => {
    const catalog = createCatalog(files);
    const tree = buildTree(catalog);
    const titleNode = tree[0]!.children[0]!;

    expect(getSourceEntriesForTreeNode(titleNode).map((entry) => entry.kind)).toEqual(["template", "localize"]);
  });
});

describe("getTranslationEntriesForTreeNode", () => {
  it("returns sorted translation entries for a source tree node", () => {
    const catalog = createCatalog([
      ...files,
      { path: "messages.fr.json", content: '{ "home.title": "Accueil" }' }
    ]);
    const tree = buildTree(catalog);
    const titleNode = tree[0]!.children[0]!;

    expect(getTranslationEntriesForTreeNode(catalog, titleNode).map((entry) => entry.locale)).toEqual(["de", "fr"]);
  });
});

describe("createAddMissingTranslationTextEdit", () => {
  it("adds a missing key to a nested translations object", () => {
    const file = {
      path: "messages.de.json",
      content: '{\n  "locale": "de",\n  "translations": {\n    "home.title": "Startseite"\n  }\n}'
    };
    const edit = createAddMissingTranslationTextEdit(file, "home.intro")!;

    expect(JSON.parse(applyTextEdit(file.content, edit)).translations).toMatchObject({
      "home.title": "Startseite",
      "home.intro": ""
    });
  });

  it("adds a missing key to a root translation object", () => {
    const file = {
      path: "messages.de.json",
      content: '{\n  "home.title": "Startseite"\n}'
    };
    const edit = createAddMissingTranslationTextEdit(file, "home.intro")!;

    expect(JSON.parse(applyTextEdit(file.content, edit))).toMatchObject({
      "home.title": "Startseite",
      "home.intro": ""
    });
  });
});

describe("createRemoveTranslationTextEdit", () => {
  it("removes an orphaned translation property with a trailing comma", () => {
    const file = {
      path: "messages.de.json",
      content: '{\n  "home.extra": "Extra",\n  "home.title": "Startseite"\n}'
    };
    const entry = createCatalog([file]).translationEntries.find((candidate) => candidate.id === "home.extra")!;
    const edit = createRemoveTranslationTextEdit(file, entry);
    const updated = applyTextEdit(file.content, edit);

    expect(JSON.parse(updated)).toEqual({ "home.title": "Startseite" });
    expect(updated).not.toContain("home.extra");
  });

  it("removes an orphaned final translation property and previous comma", () => {
    const file = {
      path: "messages.de.json",
      content: '{\n  "home.title": "Startseite",\n  "home.extra": "Extra"\n}'
    };
    const entry = createCatalog([file]).translationEntries.find((candidate) => candidate.id === "home.extra")!;
    const updated = applyTextEdit(file.content, createRemoveTranslationTextEdit(file, entry));

    expect(JSON.parse(updated)).toEqual({ "home.title": "Startseite" });
    expect(updated).not.toContain("home.extra");
  });
});

describe("getFileDiagnostics", () => {
  it("projects diagnostics to concrete file entries", () => {
    const diagnostics = getFileDiagnostics(createCatalog([...files, { path: "c.html", content: '<p i18n="Intro@@home.intro">Intro</p>' }]));

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceFile: "a.html", diagnostic: expect.objectContaining({ kind: "duplicate-source-id" }) }),
        expect.objectContaining({ sourceFile: "b.ts", diagnostic: expect.objectContaining({ kind: "duplicate-source-id" }) }),
        expect.objectContaining({ sourceFile: "messages.de.json", diagnostic: expect.objectContaining({ kind: "extra-translation" }) }),
        expect.objectContaining({ sourceFile: "c.html", diagnostic: expect.objectContaining({ kind: "missing-translation" }) })
      ])
    );
  });
});

describe("createRootTreeNodes", () => {
  it("prepends a Problems group when diagnostics exist", () => {
    const catalog = createCatalog([...files, { path: "c.html", content: '<p i18n="Intro@@home.intro">Intro</p>' }]);
    const nodes = createRootTreeNodes(getCatalogDiagnostics(catalog), buildTree(catalog));

    expect(isProblemGroupNode(nodes[0]!)).toBe(true);
    if (!isProblemGroupNode(nodes[0]!)) {
      throw new Error("Expected first tree node to be a problem group");
    }
    expect(getProblemChildren(nodes[0])).toHaveLength(getCatalogDiagnostics(catalog).length);
  });
});
