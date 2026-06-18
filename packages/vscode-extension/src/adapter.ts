import {
  createCatalog,
  createRenameEdits,
  findReferences,
  getCatalogDiagnostics,
  type LocalizationCatalog,
  type LocalizationDiagnostic,
  type LocalizationEntry,
  type LocalizationTextEdit,
  type LocalizationTreeNode,
  type WorkspaceFile
} from "@angular-i18n-tools/core";

export type TreeNode = LocalizationTreeNode | ProblemGroupNode | ProblemNode;

export interface ProblemGroupNode {
  kind: "problem-group";
  diagnostics: LocalizationDiagnostic[];
}

export interface ProblemNode {
  kind: "problem";
  diagnostic: LocalizationDiagnostic;
}

export interface FileDiagnostic {
  sourceFile: string;
  diagnostic: LocalizationDiagnostic;
  entry: LocalizationEntry;
}

export interface WorkspaceTextEdit {
  sourceFile: string;
  range: LocalizationTextEdit["range"];
  newText: string;
}

export function findEntryAtOffset(
  catalog: LocalizationCatalog,
  sourceFile: string,
  offset: number
): LocalizationEntry | undefined {
  return catalog.entries.find(
    (candidate) =>
      candidate.sourceFile === sourceFile &&
      candidate.range.start.offset <= offset &&
      offset < candidate.range.end.offset
  );
}

export function createRenameTextEdits(
  files: WorkspaceFile[],
  entry: LocalizationEntry,
  newName: string
): LocalizationTextEdit[] {
  return createRenameEdits(files, entry.id, newName);
}

export function createRenameGroupTextEdits(
  files: WorkspaceFile[],
  oldPrefix: string,
  newPrefix: string
): LocalizationTextEdit[] {
  return createCatalog(files)
    .entries.filter((entry) => entry.id === oldPrefix || entry.id.startsWith(`${oldPrefix}.`))
    .map((entry) => ({
      sourceFile: entry.sourceFile,
      range: entry.range,
      newText: `${newPrefix}${entry.id.slice(oldPrefix.length)}`
    }));
}

export function createMoveTreeNodeTextEdits(
  files: WorkspaceFile[],
  source: LocalizationTreeNode,
  target: LocalizationTreeNode
): LocalizationTextEdit[] {
  if (source.id === target.id || target.id.startsWith(`${source.id}.`)) {
    return [];
  }

  const newPrefix = `${target.id}.${source.name}`;

  if (source.children.length > 0) {
    return newPrefix === source.id ? [] : createRenameGroupTextEdits(files, source.id, newPrefix);
  }

  return newPrefix === source.id ? [] : createRenameEdits(files, source.id, newPrefix);
}

export function getNonDescendantTreeNodes(nodes: readonly LocalizationTreeNode[]): LocalizationTreeNode[] {
  return nodes.filter((node) => !nodes.some((candidate) => candidate !== node && node.id.startsWith(`${candidate.id}.`)));
}

export function getDefinitionEntries(catalog: LocalizationCatalog, entry: LocalizationEntry): LocalizationEntry[] {
  return findReferences(catalog, entry.id).filter((candidate) => {
    if (entry.kind === "translation") {
      return candidate.kind !== "translation";
    }

    return candidate.kind === "translation";
  });
}

export function getSourceEntriesForTreeNode(node: LocalizationTreeNode): LocalizationEntry[] {
  return node.entries
    .filter((entry) => entry.kind !== "translation")
    .sort((left, right) => {
      const fileComparison = left.sourceFile.localeCompare(right.sourceFile);

      if (fileComparison !== 0) {
        return fileComparison;
      }

      return left.range.start.offset - right.range.start.offset;
    });
}

export function getTranslationEntriesForTreeNode(
  catalog: LocalizationCatalog,
  node: LocalizationTreeNode
): LocalizationEntry[] {
  return catalog.translationEntries
    .filter((entry) => entry.id === node.id)
    .sort((left, right) => {
      const localeComparison = (left.locale ?? "").localeCompare(right.locale ?? "");

      if (localeComparison !== 0) {
        return localeComparison;
      }

      return left.sourceFile.localeCompare(right.sourceFile) || left.range.start.offset - right.range.start.offset;
    });
}

export function createAddMissingTranslationTextEdit(file: WorkspaceFile, id: string): WorkspaceTextEdit | undefined {
  const targetObject = findTranslationsObject(file.content) ?? findRootJsonObject(file.content);

  if (!targetObject) {
    return undefined;
  }

  const innerContent = file.content.slice(targetObject.start + 1, targetObject.end);
  const hasProperties = /"((?:[^"\\]|\\.)+)"\s*:/.test(innerContent);
  const indent = inferPropertyIndent(file.content, targetObject.start, targetObject.end);
  const closingIndent = indentationAtOffset(file.content, targetObject.end);
  const escapedId = JSON.stringify(id).slice(1, -1);
  const newText = hasProperties
    ? `,\n${indent}"${escapedId}": ""`
    : `\n${indent}"${escapedId}": ""\n${closingIndent}`;

  return {
    sourceFile: file.path,
    range: rangeForOffsets(file, targetObject.end, targetObject.end),
    newText
  };
}

export function createRemoveTranslationTextEdit(file: WorkspaceFile, entry: LocalizationEntry): WorkspaceTextEdit {
  const lineStart = file.content.lastIndexOf("\n", entry.range.start.offset) + 1;
  const nextLineStart = file.content.indexOf("\n", entry.range.end.offset);
  const lineEnd = nextLineStart === -1 ? file.content.length : nextLineStart + 1;
  const line = file.content.slice(lineStart, lineEnd);
  let start = lineStart;
  let end = lineEnd;
  let newText = "";

  if (!line.includes(",")) {
    const previousLineEnd = Math.max(0, lineStart - 1);
    const previousLineStart = file.content.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previousLine = file.content.slice(previousLineStart, previousLineEnd);
    const trailingCommaIndex = previousLine.lastIndexOf(",");

    if (trailingCommaIndex !== -1) {
      start = previousLineStart + trailingCommaIndex;
      end = lineEnd;
      newText = "";
    }
  }

  return {
    sourceFile: file.path,
    range: rangeForOffsets(file, start, end),
    newText
  };
}

export function getFileDiagnostics(catalog: LocalizationCatalog): FileDiagnostic[] {
  return getCatalogDiagnostics(catalog).flatMap((diagnostic) =>
    entriesForDiagnostic(catalog, diagnostic).map((entry) => ({
      sourceFile: entry.sourceFile,
      diagnostic,
      entry
    }))
  );
}

export function createRootTreeNodes(
  diagnostics: LocalizationDiagnostic[],
  tree: LocalizationTreeNode[]
): TreeNode[] {
  return diagnostics.length > 0 ? [{ kind: "problem-group", diagnostics }, ...tree] : tree;
}

export function getProblemChildren(group: ProblemGroupNode): ProblemNode[] {
  return group.diagnostics.map((diagnostic) => ({ kind: "problem", diagnostic }));
}

export function isProblemGroupNode(node: TreeNode): node is ProblemGroupNode {
  return "kind" in node && node.kind === "problem-group";
}

export function isProblemNode(node: TreeNode): node is ProblemNode {
  return "kind" in node && node.kind === "problem";
}

export function isLocalizationTreeNode(node: TreeNode): node is LocalizationTreeNode {
  return !isProblemGroupNode(node) && !isProblemNode(node);
}

export function diagnosticDescription(diagnostic: LocalizationDiagnostic): string {
  if (diagnostic.locale) {
    return `${diagnostic.kind}, ${diagnostic.locale}`;
  }

  return diagnostic.kind;
}

function entriesForDiagnostic(catalog: LocalizationCatalog, diagnostic: LocalizationDiagnostic): LocalizationEntry[] {
  if (diagnostic.entry) {
    return [diagnostic.entry];
  }

  return catalog.sourceEntries.filter((entry) => entry.id === diagnostic.id);
}

function findTranslationsObject(content: string): { start: number; end: number } | undefined {
  const match = /"translations"\s*:\s*\{/.exec(content);

  if (!match || match.index === undefined) {
    return undefined;
  }

  const start = match.index + match[0].lastIndexOf("{");
  const end = findMatchingBrace(content, start);

  return end === -1 ? undefined : { start, end };
}

function findRootJsonObject(content: string): { start: number; end: number } | undefined {
  const start = content.indexOf("{");
  const end = start === -1 ? -1 : findMatchingBrace(content, start);

  return start === -1 || end === -1 ? undefined : { start, end };
}

function findMatchingBrace(content: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const character = content[index];

    if (inString) {
      escaped = character === "\\" && !escaped;
      if (character === "\"" && !escaped) {
        inString = false;
      } else if (character !== "\\") {
        escaped = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function inferPropertyIndent(content: string, objectStart: number, objectEnd: number): string {
  const innerContent = content.slice(objectStart + 1, objectEnd);
  const existingProperty = /\n([ \t]*)"/.exec(innerContent);

  if (existingProperty?.[1]) {
    return existingProperty[1];
  }

  return `${indentationAtOffset(content, objectStart)}  `;
}

function indentationAtOffset(content: string, offset: number): string {
  const lineStart = content.lastIndexOf("\n", offset) + 1;
  const indentation = /^[ \t]*/.exec(content.slice(lineStart, offset));

  return indentation?.[0] ?? "";
}

function rangeForOffsets(file: WorkspaceFile, start: number, end: number): LocalizationTextEdit["range"] {
  return {
    start: locationAtOffset(file, start),
    end: locationAtOffset(file, end)
  };
}

function locationAtOffset(file: WorkspaceFile, offset: number): LocalizationEntry["range"]["start"] {
  const before = file.content.slice(0, offset);
  const lines = before.split(/\r?\n/);
  const lastLine = lines.at(-1) ?? "";

  return {
    sourceFile: file.path,
    offset,
    line: lines.length,
    column: lastLine.length + 1
  };
}
