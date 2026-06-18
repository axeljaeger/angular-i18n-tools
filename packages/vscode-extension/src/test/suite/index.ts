import * as vscode from "vscode";

export async function run(): Promise<void> {
  await activatesInWebExtensionHost();
  await providesDefinitionsFromSourceIds();
  await providesSemanticTokensForLocalizationMetadata();
  await opensTreeNodeSourceEntries();
  await providesRenameEdits();
  await renamesGroupsFromTreeCommand();
  await movesLeafNodesFromTreeCommand();
  await addsMissingTranslationsFromQuickFix();
  await removesOrphanedTranslationsFromQuickFix();
  await publishesNoDiagnosticsForCleanSample();
}

async function activatesInWebExtensionHost(): Promise<void> {
  const extension = getExtensionUnderTest();

  assert(extension, "Expected extension to be registered");
  await extension.activate();

  assert(extension.isActive, "Expected extension to be active");
}

async function providesDefinitionsFromSourceIds(): Promise<void> {
  await activateExtension();
  const document = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const position = positionInside(document, "settingsDialog.applyButton");
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeDefinitionProvider",
    document.uri,
    position
  );

  assert(locations.length >= 2, "Expected German and French translation definition locations");
  assert(
    locations.some((location) => location.uri.path.endsWith("messages.de.json")),
    "Expected definition result in messages.de.json"
  );
  assert(
    locations.some((location) => location.uri.path.endsWith("messages.fr.json")),
    "Expected definition result in messages.fr.json"
  );
}

async function providesRenameEdits(): Promise<void> {
  await activateExtension();
  const document = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const position = positionInside(document, "settingsDialog.applyButton");
  const workspaceEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    document.uri,
    position,
    "settingsDialog.confirmButton"
  );
  const entries = workspaceEdit.entries();

  assert(entries.length >= 3, "Expected rename edits for source, German JSON, and French JSON");
  assert(
    entries.some(([uri]) => uri.path.endsWith("settings-dialog.component.html")),
    "Expected source template rename edit"
  );
  assert(entries.some(([uri]) => uri.path.endsWith("messages.de.json")), "Expected German catalog rename edit");
  assert(entries.some(([uri]) => uri.path.endsWith("messages.fr.json")), "Expected French catalog rename edit");
}

async function renamesGroupsFromTreeCommand(): Promise<void> {
  await activateExtension();
  const templateDocument = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const componentDocument = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.ts");
  const germanCatalog = await openWorkspaceDocument("src/locale/messages.de.json");
  const frenchCatalog = await openWorkspaceDocument("src/locale/messages.fr.json");
  const groupNode = createTreeNode("settingsDialog", "settingsDialog", [{ name: "title", id: "settingsDialog.title" }]);

  await vscode.commands.executeCommand("angularI18nTools.renameTreeGroup", groupNode, "preferencesDialog");
  await delay(250);

  assert(
    templateDocument.getText().includes("preferencesDialog.applyButton"),
    "Expected group rename command to update template IDs"
  );
  assert(
    componentDocument.getText().includes("preferencesDialog.description"),
    "Expected group rename command to update $localize IDs"
  );
  assert(germanCatalog.getText().includes('"preferencesDialog.title"'), "Expected group rename command to update German catalog");
  assert(frenchCatalog.getText().includes('"preferencesDialog.title"'), "Expected group rename command to update French catalog");

  await vscode.commands.executeCommand(
    "angularI18nTools.renameTreeGroup",
    createTreeNode("preferencesDialog", "preferencesDialog", [{ name: "title", id: "preferencesDialog.title" }]),
    "settingsDialog"
  );
  await delay(250);

  assert(templateDocument.getText().includes("settingsDialog.applyButton"), "Expected inverse group rename to restore template IDs");
  assert(componentDocument.getText().includes("settingsDialog.description"), "Expected inverse group rename to restore $localize IDs");
}

async function movesLeafNodesFromTreeCommand(): Promise<void> {
  await activateExtension();
  const profileDocument = await openWorkspaceDocument("src/app/user-profile/user-profile.component.html");
  const germanCatalog = await openWorkspaceDocument("src/locale/messages.de.json");
  const frenchCatalog = await openWorkspaceDocument("src/locale/messages.fr.json");
  const emailNode = createTreeNode("email", "userProfile.email");
  const settingsGroupNode = createTreeNode("settingsDialog", "settingsDialog", [
    { name: "title", id: "settingsDialog.title" }
  ]);

  await vscode.commands.executeCommand("angularI18nTools.moveTreeNode", emailNode, settingsGroupNode);
  await delay(250);

  assert(profileDocument.getText().includes("settingsDialog.email"), "Expected move command to update source ID");
  assert(germanCatalog.getText().includes('"settingsDialog.email"'), "Expected move command to update German catalog");
  assert(frenchCatalog.getText().includes('"settingsDialog.email"'), "Expected move command to update French catalog");

  await vscode.commands.executeCommand(
    "angularI18nTools.moveTreeNode",
    createTreeNode("email", "settingsDialog.email"),
    createTreeNode("userProfile", "userProfile", [{ name: "title", id: "userProfile.title" }])
  );
  await delay(250);

  assert(profileDocument.getText().includes("userProfile.email"), "Expected inverse move to restore source ID");
  assert(germanCatalog.getText().includes('"userProfile.email"'), "Expected inverse move to restore German catalog");
  assert(frenchCatalog.getText().includes('"userProfile.email"'), "Expected inverse move to restore French catalog");
}

async function addsMissingTranslationsFromQuickFix(): Promise<void> {
  await activateExtension();
  const sourceDocument = await openWorkspaceDocument("src/app/user-profile/user-profile.component.html");
  const germanCatalog = await openWorkspaceDocument("src/locale/messages.de.json");
  const originalCatalogText = germanCatalog.getText();

  try {
    await replaceDocumentText(germanCatalog, originalCatalogText.replace('    "userProfile.name": "Name",\n', ""));
    await waitForDiagnostic("missing-translation", "userProfile.name", "de");

    const range = rangeForText(sourceDocument, "userProfile.name");
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      sourceDocument.uri,
      range,
      vscode.CodeActionKind.QuickFix.value
    );
    const action = actions.find((candidate) => candidate.title === "Add missing de translation");

    assert(action?.edit, "Expected quick fix to add missing German translation");
    await vscode.workspace.applyEdit(action.edit);

    assert(germanCatalog.getText().includes('"userProfile.name": ""'), "Expected quick fix to insert missing German key");
  } finally {
    await replaceDocumentText(germanCatalog, originalCatalogText);
  }
}

async function removesOrphanedTranslationsFromQuickFix(): Promise<void> {
  await activateExtension();
  const germanCatalog = await openWorkspaceDocument("src/locale/messages.de.json");
  const originalCatalogText = germanCatalog.getText();

  try {
    await replaceDocumentText(
      germanCatalog,
      originalCatalogText.replace('    "userProfile.email": "E-Mail"\n', '    "userProfile.email": "E-Mail",\n    "userProfile.orphan": "Unused"\n')
    );
    await waitForDiagnostic("extra-translation", "userProfile.orphan", "de");

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      germanCatalog.uri,
      rangeForText(germanCatalog, "userProfile.orphan"),
      vscode.CodeActionKind.QuickFix.value
    );
    const action = actions.find((candidate) => candidate.title === "Remove orphaned translation");

    assert(action?.edit, "Expected quick fix to remove orphaned German translation");
    await vscode.workspace.applyEdit(action.edit);

    assert(!germanCatalog.getText().includes("userProfile.orphan"), "Expected quick fix to remove orphaned German key");
  } finally {
    await replaceDocumentText(germanCatalog, originalCatalogText);
  }
}

async function opensTreeNodeSourceEntries(): Promise<void> {
  await activateExtension();
  const sourceDocument = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const position = positionInside(sourceDocument, "settingsDialog.applyButton");
  const idOffset = sourceDocument.getText().indexOf("settingsDialog.applyButton");
  const startPosition = sourceDocument.positionAt(idOffset);
  const endPosition = sourceDocument.positionAt(idOffset + "settingsDialog.applyButton".length);
  const offset = sourceDocument.offsetAt(position);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  assert(workspaceFolder, "Expected a workspace folder");
  await vscode.commands.executeCommand("angularI18nTools.openTreeNode", {
    name: "applyButton",
    id: "settingsDialog.applyButton",
    children: [],
    entries: [
      {
        id: "settingsDialog.applyButton",
        kind: "template",
        sourceFile: "src/app/settings-dialog/settings-dialog.component.html",
        offset,
        line: position.line + 1,
        column: position.character + 1,
        range: {
          start: {
            sourceFile: "src/app/settings-dialog/settings-dialog.component.html",
            offset: idOffset,
            line: startPosition.line + 1,
            column: startPosition.character + 1
          },
          end: {
            sourceFile: "src/app/settings-dialog/settings-dialog.component.html",
            offset: idOffset + "settingsDialog.applyButton".length,
            line: endPosition.line + 1,
            column: endPosition.character + 1
          }
        }
      }
    ]
  });

  const activeEditor = vscode.window.activeTextEditor;

  assert(activeEditor, "Expected a text editor after opening a tree node");
  assert(
    activeEditor.document.uri.path.endsWith("settings-dialog.component.html"),
    `Expected tree node command to open settings dialog template, got ${activeEditor.document.uri.path}`
  );
  assert(
    activeEditor.document.getText(activeEditor.selection).includes("settingsDialog.applyButton"),
    "Expected tree node command to select the localization ID"
  );
}

async function providesSemanticTokensForLocalizationMetadata(): Promise<void> {
  await activateExtension();
  const document = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const semanticTokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    document.uri
  );
  const idOffset = document.getText().indexOf("settingsDialog.applyButton");
  const idPosition = document.positionAt(idOffset);
  const decodedTokens = decodeSemanticTokens(semanticTokens);

  assert(semanticTokens, "Expected semantic tokens for template localization metadata");
  assert(
    decodedTokens.some(
      (token) =>
        token.line === idPosition.line &&
        token.character === idPosition.character &&
        token.length === "settingsDialog.applyButton".length &&
        token.tokenType === 2
    ),
    "Expected a semantic token for the localization custom ID"
  );
}

function decodeSemanticTokens(tokens: vscode.SemanticTokens | undefined): Array<{
  line: number;
  character: number;
  length: number;
  tokenType: number;
}> {
  assert(tokens, "Expected semantic tokens");
  const decoded = [];
  let line = 0;
  let character = 0;

  for (let index = 0; index < tokens.data.length; index += 5) {
    line += tokens.data[index]!;
    character = tokens.data[index] === 0 ? character + tokens.data[index + 1]! : tokens.data[index + 1]!;
    decoded.push({
      line,
      character,
      length: tokens.data[index + 2]!,
      tokenType: tokens.data[index + 3]!
    });
  }

  return decoded;
}

async function publishesNoDiagnosticsForCleanSample(): Promise<void> {
  await activateExtension();
  const document = await openWorkspaceDocument("src/app/settings-dialog/settings-dialog.component.html");
  const position = positionInside(document, "settingsDialog.applyButton");

  await vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri, position);
  const diagnostics = vscode.languages.getDiagnostics().filter(([, entries]) => entries.length > 0);

  assert(diagnostics.length === 0, `Expected no diagnostics, got ${diagnostics.length}`);
}

async function activateExtension(): Promise<void> {
  const extension = getExtensionUnderTest();

  assert(extension, "Expected extension to be registered");
  await extension.activate();
}

function getExtensionUnderTest(): vscode.Extension<unknown> | undefined {
  return vscode.extensions.all.find((extension) => {
    return (
      extension.packageJSON?.name === "angular-i18n-tools-vscode" ||
      extension.packageJSON?.displayName === "Angular i18n Tools" ||
      extension.id.includes("angular-i18n-tools-vscode")
    );
  });
}

async function openWorkspaceDocument(relativePath: string): Promise<vscode.TextDocument> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  assert(workspaceFolder, "Expected a workspace folder");
  const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await vscode.workspace.openTextDocument(uri);
    } catch (error) {
      if (attempt === 19) {
        throw error;
      }
      await delay(100);
    }
  }

  throw new Error(`Expected to open ${relativePath}`);
}

function positionInside(document: vscode.TextDocument, text: string): vscode.Position {
  const offset = document.getText().indexOf(text);

  assert(offset >= 0, `Expected document to contain ${text}`);
  return document.positionAt(offset + Math.floor(text.length / 2));
}

function rangeForText(document: vscode.TextDocument, text: string): vscode.Range {
  const offset = document.getText().indexOf(text);

  assert(offset >= 0, `Expected document to contain ${text}`);
  return new vscode.Range(document.positionAt(offset), document.positionAt(offset + text.length));
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

  edit.replace(document.uri, fullRange, text);
  assert(await vscode.workspace.applyEdit(edit), `Expected to update ${document.uri.path}`);
  await refreshLocalizationCatalog();
}

async function refreshLocalizationCatalog(): Promise<void> {
  await vscode.commands.executeCommand("angularI18nTools.refresh");
  const document = await openWorkspaceDocument("src/app/app.component.html");
  await vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri, positionInside(document, "app.title"));
  await delay(100);
}

async function waitForDiagnostic(kind: string, id: string, locale: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      vscode.languages
        .getDiagnostics()
        .some(([, diagnostics]) =>
          diagnostics.some(
            (diagnostic) =>
              diagnostic.source === "angular-i18n-tools" &&
              typeof diagnostic.code === "string" &&
              diagnostic.code.includes(`"kind":"${kind}"`) &&
              diagnostic.code.includes(`"id":"${id}"`) &&
              diagnostic.code.includes(`"locale":"${locale}"`)
          )
        )
    ) {
      return;
    }

    await delay(100);
  }

  throw new Error(`Expected ${kind} diagnostic for ${id} in ${locale}`);
}

function createTreeNode(
  name: string,
  id: string,
  children: Array<{ name: string; id: string }> = []
): {
  name: string;
  id: string;
  children: Array<{ name: string; id: string; children: never[]; entries: never[] }>;
  entries: never[];
} {
  return {
    name,
    id,
    children: children.map((child) => ({ ...child, children: [], entries: [] })),
    entries: []
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    const extensionIds = vscode.extensions.all.map((extension) => extension.id).sort().join(", ");
    throw new Error(`${message}. Available extensions: ${extensionIds}`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
