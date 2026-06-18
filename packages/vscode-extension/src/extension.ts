import * as vscode from "vscode";
import {
  buildTree,
  compareTranslations,
  createCatalog,
  getCatalogDiagnostics,
  type LocalizationCatalog,
  type LocalizationDiagnosticKind,
  type LocalizationEntry,
  type LocalizationTextEdit,
  type SourceRange,
  type WorkspaceFile
} from "@angular-i18n-tools/core";
import {
  createAddMissingTranslationTextEdit,
  createMoveTreeNodeTextEdits,
  createRemoveTranslationTextEdit,
  createRenameGroupTextEdits,
  createRenameTextEdits,
  createRootTreeNodes,
  diagnosticDescription,
  findEntryAtOffset,
  getDefinitionEntries,
  getFileDiagnostics,
  getNonDescendantTreeNodes,
  getProblemChildren,
  getSourceEntriesForTreeNode,
  getTranslationEntriesForTreeNode,
  isLocalizationTreeNode,
  isProblemGroupNode,
  isProblemNode,
  type TreeNode
} from "./adapter";
import { getLocalizationSemanticTokens, localizationSemanticTokenTypes } from "./syntax";

const localizationSemanticTokensLegend = new vscode.SemanticTokensLegend([...localizationSemanticTokenTypes]);
const localizationSemanticTokenTypeIndexes = new Map(
  localizationSemanticTokenTypes.map((tokenType, index) => [tokenType, index])
);
const localizationTreeDragMimeType = "application/vnd.angular-i18n-tools.localization-tree-node";

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("angular-i18n-tools");
  const provider = new LocalizationTreeProvider();

  context.subscriptions.push(
    diagnosticCollection,
    vscode.window.createTreeView("angularI18nTools.localizationTree", {
      treeDataProvider: provider,
      dragAndDropController: new LocalizationTreeDragAndDropController(provider),
      canSelectMany: true
    }),
    vscode.commands.registerCommand("angularI18nTools.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("angularI18nTools.openTreeNode", (node: TreeNode) => provider.openTreeNode(node)),
    vscode.commands.registerCommand("angularI18nTools.renameTreeNode", (node: TreeNode) => provider.renameTreeNode(node)),
    vscode.commands.registerCommand("angularI18nTools.renameTreeGroup", (node: TreeNode, newName?: string) =>
      provider.renameTreeGroup(node, newName)
    ),
    vscode.commands.registerCommand("angularI18nTools.moveTreeNode", (source: TreeNode, target: TreeNode) =>
      provider.moveTreeNodes([source], target)
    ),
    vscode.commands.registerCommand("angularI18nTools.openTreeNodeTranslation", (node: TreeNode) =>
      provider.openTreeNodeTranslation(node)
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isLocalizationDocument(event.document)) {
        provider.scheduleRefresh();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isLocalizationDocument(document)) {
        provider.scheduleRefresh();
      }
    }),
    createLocalizationFileWatcher(provider),
    vscode.languages.registerRenameProvider(
      [{ language: "html" }, { language: "typescript" }, { pattern: "**/messages.*.json" }],
      new LocalizationRenameProvider(provider)
    ),
    vscode.languages.registerDefinitionProvider(
      [{ language: "html" }, { language: "typescript" }, { pattern: "**/messages.*.json" }],
      new LocalizationDefinitionProvider(provider)
    ),
    vscode.languages.registerCodeActionsProvider(
      [{ language: "html" }, { language: "typescript" }, { pattern: "**/messages.*.json" }],
      new LocalizationCodeActionProvider(provider),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      }
    ),
    vscode.languages.registerDocumentSemanticTokensProvider(
      [{ language: "html" }, { language: "typescript" }],
      new LocalizationSemanticTokensProvider(),
      localizationSemanticTokensLegend
    )
  );

  provider.setDiagnostics(diagnosticCollection);
}

export function deactivate(): void {
  // No background resources are kept alive.
}

class LocalizationTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  private catalog: LocalizationCatalog | undefined;
  private files: WorkspaceFile[] | undefined;
  private diagnosticCollection: vscode.DiagnosticCollection | undefined;
  private refreshTimeout: ReturnType<typeof setTimeout> | undefined;

  readonly onDidChangeTreeData = this.changed.event;

  refresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }

    this.catalog = undefined;
    this.files = undefined;
    this.diagnosticCollection?.clear();
    this.changed.fire(undefined);
  }

  scheduleRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = setTimeout(() => {
      this.refreshTimeout = undefined;
      this.refresh();
    }, 100);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (isProblemGroupNode(element)) {
      const item = new vscode.TreeItem("Problems", vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${element.diagnostics.length}`;
      item.iconPath = new vscode.ThemeIcon("warning");
      return item;
    }

    if (isProblemNode(element)) {
      const item = new vscode.TreeItem(element.diagnostic.id, vscode.TreeItemCollapsibleState.None);
      item.description = diagnosticDescription(element.diagnostic);
      item.tooltip = element.diagnostic.message;
      item.iconPath = new vscode.ThemeIcon("warning");

      if (element.diagnostic.entry) {
        const uri = findWorkspaceUri(element.diagnostic.entry.sourceFile);
        if (uri) {
          item.command = {
            command: "vscode.open",
            title: "Open localization diagnostic",
            arguments: [uri, { selection: toVscodeRange(element.diagnostic.entry.range) }]
          };
        }
      }

      return item;
    }

    const collapsibleState =
      element.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.name, collapsibleState);

    if (element.children.length > 0) {
      item.contextValue = "localizationGroup";
    }

    if (element.entries.length > 0) {
      if (element.children.length === 0) {
        item.contextValue = "localizationLeaf";
      }

      const issueCount = this.catalog ? getCatalogDiagnostics(this.catalog).filter((issue) => issue.id === element.id).length : 0;
      item.description = issueCount > 0 ? `${element.id} (${issueCount} issue${issueCount === 1 ? "" : "s"})` : element.id;
      if (issueCount > 0) {
        item.iconPath = new vscode.ThemeIcon("warning");
      }
      item.command = {
        command: "angularI18nTools.openTreeNode",
        title: "Open Angular localization ID",
        arguments: [element]
      };
    }
    item.tooltip =
      element.entries.map((entry) => `${entry.sourceFile}:${entry.line}:${entry.column} (${entry.kind})`).join("\n") ||
      element.id;

    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (element && isProblemGroupNode(element)) {
      return getProblemChildren(element);
    }

    if (element && isProblemNode(element)) {
      return [];
    }

    if (element) {
      return element.children;
    }

    const catalog = await this.getCatalog();
    const diagnostics = getCatalogDiagnostics(catalog);
    const tree = buildTree(catalog);

    return createRootTreeNodes(diagnostics, tree);
  }

  async getCatalog(): Promise<LocalizationCatalog> {
    if (!this.catalog) {
      this.files = await readWorkspaceFiles();
      this.catalog = createCatalog(this.files);
      const coverage = compareTranslations(this.catalog);

      if (coverage.some((locale) => locale.missing.length > 0 || locale.extra.length > 0)) {
        console.warn("Angular i18n translation coverage issues", coverage);
      }

      this.updateDiagnostics(this.catalog);
    }

    return this.catalog;
  }

  setDiagnostics(diagnosticCollection: vscode.DiagnosticCollection): void {
    this.diagnosticCollection = diagnosticCollection;
  }

  async getFiles(): Promise<WorkspaceFile[]> {
    if (!this.files) {
      await this.getCatalog();
    }

    return this.files ?? [];
  }

  async getEntryAt(document: vscode.TextDocument, position: vscode.Position): Promise<LocalizationEntry | undefined> {
    const catalog = await this.getCatalog();
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const offset = document.offsetAt(position);

    return findEntryAtOffset(catalog, relativePath, offset);
  }

  async openTreeNode(node: TreeNode): Promise<void> {
    if (isProblemGroupNode(node) || isProblemNode(node)) {
      return;
    }

    const sourceEntries = getSourceEntriesForTreeNode(node);

    if (sourceEntries.length === 0) {
      return;
    }

    if (sourceEntries.length === 1) {
      await openEntry(sourceEntries[0]!);
      return;
    }

    const selected = await vscode.window.showQuickPick(
      sourceEntries.map((entry) => ({
        label: entry.sourceFile,
        description: `${entry.line}:${entry.column} (${entry.kind})`,
        entry
      })),
      {
        placeHolder: `Open source for ${node.id}`
      }
    );

    if (selected) {
      await openEntry(selected.entry);
    }
  }

  async renameTreeNode(node: TreeNode): Promise<void> {
    if (isProblemGroupNode(node) || isProblemNode(node)) {
      return;
    }

    const sourceEntry = getSourceEntriesForTreeNode(node)[0];

    if (!sourceEntry) {
      return;
    }

    await openEntry(sourceEntry);
    await vscode.commands.executeCommand("editor.action.rename");
  }

  async renameTreeGroup(node: TreeNode, providedNewName?: string): Promise<void> {
    if (isProblemGroupNode(node) || isProblemNode(node)) {
      return;
    }

    const newName =
      providedNewName ??
      (await vscode.window.showInputBox({
        title: "Rename Angular Localization Group",
        prompt: `Rename ${node.id} and all descendant localization IDs.`,
        value: node.id,
        valueSelection: [node.id.lastIndexOf(".") + 1, node.id.length],
        validateInput: validateLocalizationId
      }));

    if (!newName || newName === node.id) {
      return;
    }

    await this.applyTextEdits(createRenameGroupTextEdits(await this.getFiles(), node.id, newName));
  }

  async moveTreeNodes(sources: readonly TreeNode[], target: TreeNode | undefined): Promise<void> {
    if (!target || isProblemGroupNode(target) || isProblemNode(target) || target.children.length === 0) {
      return;
    }

    const sourceNodes = getNonDescendantTreeNodes(sources.filter(isLocalizationTreeNode));
    const files = await this.getFiles();
    const edits = sourceNodes.flatMap((source) => createMoveTreeNodeTextEdits(files, source, target));

    await this.applyTextEdits(edits);
  }

  async openTreeNodeTranslation(node: TreeNode): Promise<void> {
    if (isProblemGroupNode(node) || isProblemNode(node)) {
      return;
    }

    const catalog = await this.getCatalog();
    const translations = getTranslationEntriesForTreeNode(catalog, node);

    if (translations.length === 0) {
      void vscode.window.showInformationMessage(`No translations found for ${node.id}.`);
      return;
    }

    if (translations.length === 1) {
      await openEntry(translations[0]!);
      return;
    }

    const selected = await vscode.window.showQuickPick(
      translations.map((entry) => ({
        label: entry.locale ?? "unknown",
        description: `${entry.sourceFile}:${entry.line}:${entry.column}`,
        entry
      })),
      {
        placeHolder: `Open translation for ${node.id}`
      }
    );

    if (selected) {
      await openEntry(selected.entry);
    }
  }

  private async applyTextEdits(edits: LocalizationTextEdit[]): Promise<void> {
    if (edits.length === 0) {
      return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();

    for (const edit of edits) {
      const uri = findWorkspaceUri(edit.sourceFile);

      if (uri) {
        workspaceEdit.replace(uri, toVscodeRange(edit.range), edit.newText);
      }
    }

    if (await vscode.workspace.applyEdit(workspaceEdit)) {
      this.scheduleRefresh();
    }
  }

  private updateDiagnostics(catalog: LocalizationCatalog): void {
    if (!this.diagnosticCollection) {
      return;
    }

    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

    for (const fileDiagnostic of getFileDiagnostics(catalog)) {
      const diagnostics = diagnosticsByFile.get(fileDiagnostic.sourceFile) ?? [];
      const diagnostic = new vscode.Diagnostic(
        toVscodeRange(fileDiagnostic.entry.range),
        fileDiagnostic.diagnostic.message,
        fileDiagnostic.diagnostic.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
      );

      diagnostic.source = "angular-i18n-tools";
      diagnostic.code = encodeDiagnosticCode(
        fileDiagnostic.diagnostic.kind,
        fileDiagnostic.diagnostic.id,
        fileDiagnostic.diagnostic.locale
      );
      diagnostics.push(diagnostic);
      diagnosticsByFile.set(fileDiagnostic.sourceFile, diagnostics);
    }

    this.diagnosticCollection.clear();

    for (const [sourceFile, diagnostics] of diagnosticsByFile) {
      const uri = findWorkspaceUri(sourceFile);

      if (uri) {
        this.diagnosticCollection.set(uri, diagnostics);
      }
    }
  }
}

class LocalizationTreeDragAndDropController implements vscode.TreeDragAndDropController<TreeNode> {
  readonly dragMimeTypes = [localizationTreeDragMimeType];
  readonly dropMimeTypes = [localizationTreeDragMimeType];

  constructor(private readonly treeProvider: LocalizationTreeProvider) {}

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const sourceNodes = source.filter(isLocalizationTreeNode);

    if (sourceNodes.length > 0) {
      dataTransfer.set(localizationTreeDragMimeType, new vscode.DataTransferItem(sourceNodes));
    }
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const item = dataTransfer.get(localizationTreeDragMimeType);
    const sourceNodes = Array.isArray(item?.value) ? item.value : [];

    await this.treeProvider.moveTreeNodes(sourceNodes, target);
  }
}

class LocalizationRenameProvider implements vscode.RenameProvider {
  constructor(private readonly treeProvider: LocalizationTreeProvider) {}

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string
  ): Promise<vscode.WorkspaceEdit | undefined> {
    const entry = await this.treeProvider.getEntryAt(document, position);

    if (!entry) {
      return undefined;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    const edits = createRenameTextEdits(await this.treeProvider.getFiles(), entry, newName);

    for (const edit of edits) {
      const uri = findWorkspaceUri(edit.sourceFile);

      if (uri) {
        workspaceEdit.replace(uri, toVscodeRange(edit.range), edit.newText);
      }
    }

    return workspaceEdit;
  }

  async prepareRename(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Range | undefined> {
    const entry = await this.treeProvider.getEntryAt(document, position);

    return entry ? toVscodeRange(entry.range) : undefined;
  }
}

class LocalizationDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly treeProvider: LocalizationTreeProvider) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location[] | undefined> {
    const entry = await this.treeProvider.getEntryAt(document, position);

    if (!entry) {
      return undefined;
    }

    const catalog = await this.treeProvider.getCatalog();
    const references = getDefinitionEntries(catalog, entry);

    return references.flatMap((reference) => {
      const uri = findWorkspaceUri(reference.sourceFile);
      return uri ? [new vscode.Location(uri, toVscodeRange(reference.range))] : [];
    });
  }
}

class LocalizationCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly treeProvider: LocalizationTreeProvider) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const files = await this.treeProvider.getFiles();
    const catalog = await this.treeProvider.getCatalog();
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      const code = parseDiagnosticCode(diagnostic);

      if (!code) {
        continue;
      }

      if (code.kind === "missing-translation" && code.locale) {
        const catalogFile = files.find((file) => file.path.endsWith(`messages.${code.locale}.json`));
        const edit = catalogFile ? createAddMissingTranslationTextEdit(catalogFile, code.id) : undefined;

        if (edit) {
          actions.push(createWorkspaceEditAction(`Add missing ${code.locale} translation`, edit, diagnostic));
        }
      }

      if (code.kind === "extra-translation") {
        const entry = catalog.translationEntries.find(
          (candidate) => candidate.sourceFile === relativePath && candidate.id === code.id && candidate.locale === code.locale
        );
        const file = files.find((candidate) => candidate.path === relativePath);

        if (entry && file) {
          actions.push(createWorkspaceEditAction("Remove orphaned translation", createRemoveTranslationTextEdit(file, entry), diagnostic));
        }
      }
    }

    return actions;
  }
}

class LocalizationSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(localizationSemanticTokensLegend);
    const tokens = getLocalizationSemanticTokens(document.getText(), document.languageId);

    for (const token of tokens) {
      builder.push(token.line, token.character, token.length, localizationSemanticTokenTypeIndexes.get(token.tokenType)!, 0);
    }

    return builder.build();
  }
}

async function readWorkspaceFiles(): Promise<WorkspaceFile[]> {
  const uris = await vscode.workspace.findFiles(
    "**/*.{html,ts,json}",
    "**/{node_modules,dist,.angular,storybook-static}/**"
  );
  const openDocuments = new Map(vscode.workspace.textDocuments.map((document) => [document.uri.toString(), document]));

  return Promise.all(
    uris.map(async (uri) => {
      const openDocument = openDocuments.get(uri.toString());

      return {
        path: vscode.workspace.asRelativePath(uri),
        content: openDocument ? openDocument.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
      };
    })
  );
}

function createLocalizationFileWatcher(provider: LocalizationTreeProvider): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{html,ts,json}");
  const refresh = (uri: vscode.Uri) => {
    if (isLocalizationUri(uri)) {
      provider.scheduleRefresh();
    }
  };

  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);

  return watcher;
}

function isLocalizationDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "html" || document.languageId === "typescript" || isLocalizationUri(document.uri);
}

function isLocalizationUri(uri: vscode.Uri): boolean {
  return uri.path.endsWith(".html") || uri.path.endsWith(".ts") || /\/messages\.[^/]+\.json$/.test(uri.path);
}

function validateLocalizationId(value: string): string | undefined {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? undefined : "Use a non-empty dot-separated localization ID.";
}

function encodeDiagnosticCode(kind: LocalizationDiagnosticKind, id: string, locale: string | undefined): string {
  return JSON.stringify({ kind, id, locale });
}

function parseDiagnosticCode(
  diagnostic: vscode.Diagnostic
): { kind: LocalizationDiagnosticKind; id: string; locale?: string } | undefined {
  if (diagnostic.source !== "angular-i18n-tools" || typeof diagnostic.code !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(diagnostic.code);

    if (!isDiagnosticCode(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function isDiagnosticCode(value: unknown): value is { kind: LocalizationDiagnosticKind; id: string; locale?: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { kind?: unknown; id?: unknown; locale?: unknown };
  return (
    (candidate.kind === "duplicate-source-id" ||
      candidate.kind === "missing-translation" ||
      candidate.kind === "extra-translation") &&
    typeof candidate.id === "string" &&
    (candidate.locale === undefined || typeof candidate.locale === "string")
  );
}

function createWorkspaceEditAction(
  title: string,
  edit: LocalizationTextEdit,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  const workspaceEdit = new vscode.WorkspaceEdit();
  const uri = findWorkspaceUri(edit.sourceFile);

  if (uri) {
    workspaceEdit.replace(uri, toVscodeRange(edit.range), edit.newText);
  }

  action.edit = workspaceEdit;
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  return action;
}

function toVscodeRange(range: SourceRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.start.line - 1, range.start.column - 1),
    new vscode.Position(range.end.line - 1, range.end.column - 1)
  );
}

function findWorkspaceUri(relativePath: string): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.find((workspaceFolder) => {
    return relativePath === vscode.workspace.asRelativePath(vscode.Uri.joinPath(workspaceFolder.uri, relativePath));
  });

  if (folder) {
    return vscode.Uri.joinPath(folder.uri, relativePath);
  }

  const firstFolder = vscode.workspace.workspaceFolders?.[0];
  return firstFolder ? vscode.Uri.joinPath(firstFolder.uri, relativePath) : undefined;
}

async function openEntry(entry: LocalizationEntry): Promise<void> {
  const uri = findWorkspaceUri(entry.sourceFile);

  if (!uri) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  const range = toVscodeRange(entry.range);

  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
