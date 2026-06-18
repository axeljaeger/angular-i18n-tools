export type LocalizationEntryKind = "template" | "localize" | "translation";

export interface SourceLocation {
  sourceFile: string;
  offset: number;
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

export interface LocalizationEntry extends SourceLocation {
  id: string;
  kind: LocalizationEntryKind;
  range: SourceRange;
  locale?: string;
}

export interface LocalizationCatalog {
  entries: LocalizationEntry[];
  sourceEntries: LocalizationEntry[];
  translationEntries: LocalizationEntry[];
}

export interface TranslationCoverage {
  locale: string;
  missing: string[];
  extra: string[];
}

export type LocalizationDiagnosticSeverity = "error" | "warning";
export type LocalizationDiagnosticKind = "duplicate-source-id" | "missing-translation" | "extra-translation";

export interface LocalizationDiagnostic {
  kind: LocalizationDiagnosticKind;
  severity: LocalizationDiagnosticSeverity;
  id: string;
  message: string;
  entry?: LocalizationEntry;
  locale?: string;
}

export interface LocalizationTreeNode {
  name: string;
  id: string;
  children: LocalizationTreeNode[];
  entries: LocalizationEntry[];
}

export interface WorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceReader {
  readFiles(root: string): Promise<WorkspaceFile[]>;
}

export interface LocalizationTextEdit {
  sourceFile: string;
  range: SourceRange;
  newText: string;
}

const CUSTOM_ID_PATTERN = /@@([A-Za-z0-9_.-]+)/g;
const TEMPLATE_I18N_PATTERN = /\bi18n(?:-[\w-]+)?\s*=\s*(["'])(?:(?!\1).)*?@@([A-Za-z0-9_.-]+)/gs;
const LOCALIZE_PATTERN = /\$localize`[^`]*?@@([A-Za-z0-9_.-]+)(?::|`)/gs;
const JSON_PROPERTY_PATTERN = /"((?:[^"\\]|\\.)+)"\s*:/g;
const RUNTIME_TRANSLATION_FILE_PATTERN = /(?:^|\/)messages\.([^.\/]+)\.json$/;

export function parseLocalizationIds(content: string): string[] {
  return [...content.matchAll(CUSTOM_ID_PATTERN)].flatMap((match) => (match[1] ? [match[1]] : []));
}

export function createCatalog(files: WorkspaceFile[]): LocalizationCatalog {
  const entries = files.flatMap(scanFile);

  return {
    entries,
    sourceEntries: entries.filter((entry) => entry.kind !== "translation"),
    translationEntries: entries.filter((entry) => entry.kind === "translation")
  };
}

export async function scanWorkspace(root: string, reader: WorkspaceReader): Promise<LocalizationCatalog> {
  return createCatalog(await reader.readFiles(root));
}

export function scanFile(file: WorkspaceFile): LocalizationEntry[] {
  if (isIgnoredWorkspacePath(file.path)) {
    return [];
  }

  if (file.path.endsWith(".html")) {
    return scanTemplateFile(file);
  }

  if (file.path.endsWith(".ts")) {
    return scanTypeScriptFile(file);
  }

  if (isTranslationCatalogPath(file.path)) {
    return scanJsonTranslationFile(file);
  }

  return [];
}

export function scanTemplateFile(file: WorkspaceFile): LocalizationEntry[] {
  return entriesFromMatches(file, TEMPLATE_I18N_PATTERN, 2, "template");
}

export function scanTypeScriptFile(file: WorkspaceFile): LocalizationEntry[] {
  return entriesFromMatches(file, LOCALIZE_PATTERN, 1, "localize");
}

export function scanJsonTranslationFile(file: WorkspaceFile): LocalizationEntry[] {
  const locale = parseLocaleFromPath(file.path);
  const translations = parseRuntimeTranslations(file.content);

  if (!translations) {
    return [];
  }

  return [...file.content.matchAll(JSON_PROPERTY_PATTERN)].flatMap((match) => {
    const rawId = match[1];

    if (!rawId || match.index === undefined) {
      return [];
    }

    const id = unquoteJsonString(rawId);

    if (typeof translations[id] !== "string") {
      return [];
    }

    const idOffset = match.index + 1;
    const entry: LocalizationEntry = {
      id,
      kind: "translation",
      range: rangeForText(file, idOffset, rawId.length),
      ...locationAtOffset(file, match.index)
    };

    if (locale) {
      entry.locale = locale;
    }

    return [entry];
  });
}

export function findReferences(catalog: LocalizationCatalog, id: string): LocalizationEntry[] {
  return catalog.entries.filter((entry) => entry.id === id).sort(compareEntries);
}

export function createRenameEdits(files: WorkspaceFile[], oldId: string, newId: string): LocalizationTextEdit[] {
  return createCatalog(files)
    .entries.filter((entry) => entry.id === oldId)
    .map((entry) => ({
      sourceFile: entry.sourceFile,
      range: entry.range,
      newText: newId
    }))
    .sort(compareTextEdits);
}

export function applyTextEdits(content: string, edits: LocalizationTextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce((updated, edit) => {
      return `${updated.slice(0, edit.range.start.offset)}${edit.newText}${updated.slice(edit.range.end.offset)}`;
    }, content);
}

export function findDuplicateIds(catalog: LocalizationCatalog): Map<string, LocalizationEntry[]> {
  const grouped = groupById(catalog.sourceEntries);

  return new Map([...grouped].filter(([, entries]) => entries.length > 1));
}

export function compareTranslations(catalog: LocalizationCatalog): TranslationCoverage[] {
  const sourceIds = new Set(catalog.sourceEntries.map((entry) => entry.id));
  const entriesByLocale = new Map<string, LocalizationEntry[]>();

  for (const entry of catalog.translationEntries) {
    const locale = entry.locale ?? "unknown";
    const entries = entriesByLocale.get(locale) ?? [];
    entries.push(entry);
    entriesByLocale.set(locale, entries);
  }

  return [...entriesByLocale]
    .map(([locale, entries]) => {
      const translationIds = new Set(entries.map((entry) => entry.id));

      return {
        locale,
        missing: sortedDifference(sourceIds, translationIds),
        extra: sortedDifference(translationIds, sourceIds)
      };
    })
    .sort((left, right) => left.locale.localeCompare(right.locale));
}

export function getCatalogDiagnostics(catalog: LocalizationCatalog): LocalizationDiagnostic[] {
  const duplicateDiagnostics = [...findDuplicateIds(catalog)].flatMap(([id, entries]) =>
    entries.map((entry) => ({
      kind: "duplicate-source-id" as const,
      severity: "warning" as const,
      id,
      entry,
      message: `Duplicate Angular localization ID "${id}".`
    }))
  );

  const translationDiagnostics = compareTranslations(catalog).flatMap((coverage) => [
    ...coverage.missing.flatMap((id) =>
      catalog.sourceEntries
        .filter((entry) => entry.id === id)
        .map((entry) => ({
          kind: "missing-translation" as const,
          severity: "warning" as const,
          id,
          locale: coverage.locale,
          entry,
          message: `Missing ${coverage.locale} translation for Angular localization ID "${id}".`
        }))
    ),
    ...coverage.extra.flatMap((id) =>
      catalog.translationEntries
        .filter((entry) => entry.locale === coverage.locale && entry.id === id)
        .map((entry) => ({
          kind: "extra-translation" as const,
          severity: "warning" as const,
          id,
          locale: coverage.locale,
          entry,
          message: `Extra ${coverage.locale} translation for unknown Angular localization ID "${id}".`
        }))
    )
  ]);

  return [...duplicateDiagnostics, ...translationDiagnostics].sort(compareDiagnostics);
}

export function buildTree(catalog: LocalizationCatalog): LocalizationTreeNode[] {
  const roots: LocalizationTreeNode[] = [];

  for (const entry of catalog.sourceEntries) {
    let siblings = roots;
    let currentId = "";

    for (const segment of entry.id.split(".")) {
      currentId = currentId ? `${currentId}.${segment}` : segment;
      let node = siblings.find((candidate) => candidate.name === segment);

      if (!node) {
        node = {
          name: segment,
          id: currentId,
          children: [],
          entries: []
        };
        siblings.push(node);
      }

      if (currentId === entry.id) {
        node.entries.push(entry);
      }

      siblings = node.children;
    }
  }

  return sortTree(roots);
}

export function isIgnoredWorkspacePath(path: string): boolean {
  return path
    .split("/")
    .some((segment) => segment === "node_modules" || segment === "dist" || segment === ".angular" || segment === "storybook-static");
}

function entriesFromMatches(
  file: WorkspaceFile,
  pattern: RegExp,
  idGroupIndex: number,
  kind: Exclude<LocalizationEntryKind, "translation">
): LocalizationEntry[] {
  return [...file.content.matchAll(pattern)].flatMap((match) => {
    const id = match[idGroupIndex];

    if (!id || match.index === undefined) {
      return [];
    }

    const idOffset = match.index + match[0].indexOf(id);

    return [
      {
        id,
        kind,
        range: rangeForText(file, idOffset, id.length),
        ...locationAtOffset(file, match.index)
      }
    ];
  });
}

function locationAtOffset(file: WorkspaceFile, offset: number): SourceLocation {
  const before = file.content.slice(0, offset);
  const lines = before.split(/\r?\n/);
  const line = lines.length;
  const lastLine = lines.at(-1) ?? "";

  return {
    sourceFile: file.path,
    offset,
    line,
    column: lastLine.length + 1
  };
}

function rangeForText(file: WorkspaceFile, offset: number, length: number): SourceRange {
  return {
    start: locationAtOffset(file, offset),
    end: locationAtOffset(file, offset + length)
  };
}

function isTranslationCatalogPath(path: string): boolean {
  return RUNTIME_TRANSLATION_FILE_PATTERN.test(path);
}

function parseLocaleFromPath(path: string): string | undefined {
  return path.match(RUNTIME_TRANSLATION_FILE_PATTERN)?.[1];
}

function parseRuntimeTranslations(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return undefined;
    }

    return isRecord(parsed.translations) ? parsed.translations : parsed;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unquoteJsonString(value: string): string {
  return JSON.parse(`"${value}"`) as string;
}

function groupById(entries: LocalizationEntry[]): Map<string, LocalizationEntry[]> {
  const grouped = new Map<string, LocalizationEntry[]>();

  for (const entry of entries) {
    const entriesForId = grouped.get(entry.id) ?? [];
    entriesForId.push(entry);
    grouped.set(entry.id, entriesForId);
  }

  return grouped;
}

function sortedDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((id) => !right.has(id)).sort((a, b) => a.localeCompare(b));
}

function compareEntries(left: LocalizationEntry, right: LocalizationEntry): number {
  return left.sourceFile.localeCompare(right.sourceFile) || left.offset - right.offset;
}

function compareTextEdits(left: LocalizationTextEdit, right: LocalizationTextEdit): number {
  return left.sourceFile.localeCompare(right.sourceFile) || left.range.start.offset - right.range.start.offset;
}

function compareDiagnostics(left: LocalizationDiagnostic, right: LocalizationDiagnostic): number {
  return (
    left.id.localeCompare(right.id) ||
    (left.locale ?? "").localeCompare(right.locale ?? "") ||
    left.kind.localeCompare(right.kind)
  );
}

function compareNodes(left: LocalizationTreeNode, right: LocalizationTreeNode): number {
  return left.name.localeCompare(right.name);
}

function sortTree(nodes: LocalizationTreeNode[]): LocalizationTreeNode[] {
  return nodes.sort(compareNodes).map((node) => ({
    ...node,
    children: sortTree(node.children)
  }));
}
