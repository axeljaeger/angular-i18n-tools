import ts from "typescript";
import { SchematicsException } from "@angular-devkit/schematics";
import { SetupDiagnostic } from "../diagnostics.js";

function unwrap(expression: ts.Expression): ts.Expression {
  while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
  return expression;
}

function resolveConstant(source: ts.SourceFile, expression: ts.Expression, seen = new Set<string>()): ts.Expression {
  expression = unwrap(expression);
  if (!ts.isIdentifier(expression) || seen.has(expression.text)) return expression;
  const name = expression.text;
  seen.add(name);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name);
    if (declaration?.initializer) return resolveConstant(source, declaration.initializer, seen);
  }
  return expression;
}

function syntaxDescription(node?: ts.Node): string {
  // Report syntax, never project source text or string contents.
  return node ? ts.SyntaxKind[node.kind]! : "absent";
}

function location(source: ts.SourceFile, node?: ts.Node): string {
  const position = source.getLineAndCharacterOfPosition(node?.getStart(source) ?? 0);
  return `${source.fileName}:${position.line + 1}:${position.character + 1}`;
}

function defaultExport(source: ts.SourceFile): { node: ts.Node; expression?: ts.Expression } | undefined {
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) return { node: statement, expression: statement.expression };
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      const field = statement.exportClause.elements.find(item => item.name.text === "default");
      if (field) return statement.moduleSpecifier ? { node: statement } : { node: field, expression: field.propertyName ?? field.name };
    }
  }
  return undefined;
}

function exportSummary(source: ts.SourceFile): string {
  const exports: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) exports.push(statement.isExportEquals ? "export =" : "export default");
    else if (ts.isExportDeclaration(statement)) exports.push(statement.moduleSpecifier ? "re-export from another module" : "named export list");
    else if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.push(ts.isVariableStatement(statement) ? "named variable export" : "named declaration export");
    else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) && /^(?:module\.exports|exports\.)/.test(statement.expression.left.getText(source))) exports.push("CommonJS assignment");
  }
  return exports.join(", ") || "none";
}

function objectForConfig(source: ts.SourceFile): ts.ObjectLiteralExpression {
  const exported = defaultExport(source);
  let expression = exported?.expression;
  if (expression) expression = resolveConstant(source, expression);
  if (expression && ts.isCallExpression(expression) && expression.arguments[0]) expression = resolveConstant(source, expression.arguments[0]);
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    throw new SetupDiagnostic(exported ? "CONFIG_EXPORT_UNRESOLVED" : "CONFIG_EXPORT_NOT_FOUND",
      `Cannot safely edit ${location(source, exported?.node)}. ${exported ? `The exported config could not be resolved to a local object (syntax: ${syntaxDescription(expression)}).` : "No default config export was found."} Detected export forms: ${exportSummary(source)}. Imported configs and dynamic factories are not executed. No files were written.`,
      "Use export default { ... }, export default config for a local const object, or export { config as default }. Preview files may also use local named annotation exports. For imported/dynamic configurations, use manual integration while preserving the existing configuration.");
  }
  return expression;
}

function stringValue(source: ts.SourceFile, expression: ts.Expression, seen = new Set<ts.Node>()): string | undefined {
  expression = resolveConstant(source, expression);
  if (seen.has(expression)) return undefined;
  seen.add(expression);
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const part = stringValue(source, span.expression, new Set(seen));
      if (part === undefined) return undefined;
      value += part + span.literal.text;
    }
    return value;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = stringValue(source, expression.left, new Set(seen));
    const right = stringValue(source, expression.right, new Set(seen));
    return left !== undefined && right !== undefined ? left + right : undefined;
  }
  if (ts.isCallExpression(expression)) {
    const name = expression.expression.getText(source);
    if (["getAbsolutePath", "require.resolve", "import.meta.resolve", "dirname", "path.dirname"].includes(name) && expression.arguments[0]) {
      return stringValue(source, expression.arguments[0], new Set(seen));
    }
    if (["join", "path.join"].includes(name)) {
      const parts = expression.arguments.map(argument => stringValue(source, argument, new Set(seen)));
      return parts.every(part => part !== undefined) ? parts.join("/") : undefined;
    }
  }
  return undefined;
}

function propertyKey(source: ts.SourceFile, name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return ts.isComputedPropertyName(name) ? stringValue(source, name.expression) : undefined;
}

interface PropertyValue { expression?: ts.Expression; node: ts.Node; inherited?: boolean; }
function propertyValue(source: ts.SourceFile, object: ts.ObjectLiteralExpression, key: string, seen = new Set<ts.Node>()): PropertyValue | undefined {
  if (seen.has(object)) return { node: object, inherited: true };
  seen.add(object);
  for (const property of [...object.properties].reverse()) {
    if (ts.isSpreadAssignment(property)) {
      const spread = resolveConstant(source, property.expression);
      if (!ts.isObjectLiteralExpression(spread)) return { node: property, inherited: true };
      const found = propertyValue(source, spread, key, new Set(seen));
      if (found) return found;
    } else if (property.name && propertyKey(source, property.name) === key) {
      if (ts.isPropertyAssignment(property)) return { expression: property.initializer, node: property.initializer };
      if (ts.isShorthandPropertyAssignment(property)) return { expression: property.name, node: property.name };
      return { node: property };
    }
  }
  return undefined;
}

function rejectInheritedEdit(source: ts.SourceFile, object: ts.ObjectLiteralExpression, key: string): void {
  const inherited = propertyValue(source, object, key);
  if (inherited) throw new SchematicsException(`Cannot safely edit inherited ${key} at ${location(source, inherited.node)}. Found: ${syntaxDescription(inherited.node)}. Add an explicit ${key} property that preserves your base configuration, or use manual integration. Imported project code is not executed. No files were written.`);
}

function parse(content: string, path: string) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics;
  if (diagnostics.length) {
    const first = diagnostics[0]!;
    const position = source.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new SetupDiagnostic("CONFIG_SYNTAX_ERROR", `Cannot parse ${path}:${position.line + 1}:${position.character + 1} (TypeScript diagnostic TS${first.code}). No files were written.`, "Fix the configuration syntax at this location and rerun setup. Source contents are omitted from diagnostics.");
  }
  return source;
}

export function addArrayEntry(content: string, path: string, key: string, entry: string, addon = false): string {
  const source = parse(content, path);
  const object = objectForConfig(source);
  const property = object.properties.find(item => item.name && propertyKey(source, item.name) === key);
  if (!property) {
    rejectInheritedEdit(source, object, key);
    return insertProperty(content, object, `${key}: [${entry}]`);
  }
  if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) {
    throw new SchematicsException(`Cannot safely edit dynamic ${key} in ${path}. Configure it manually.`);
  }
  return appendArrayEntry(content, property.initializer, entry, addon, source);
}

function appendArrayEntry(content: string, array: ts.ArrayLiteralExpression, entry: string, addon: boolean, source: ts.SourceFile): string {
  if (array.elements.some(item => item.getText(source).trim() === entry || (addon && (
    (ts.isStringLiteral(item) && item.text === "@angular-i18n-tools/storybook-addon") ||
    (ts.isObjectLiteralExpression(item) && item.properties.some(field => ts.isPropertyAssignment(field) && field.name.getText(source) === "name" && ts.isStringLiteral(field.initializer) && field.initializer.text === "@angular-i18n-tools/storybook-addon"))
  )))) return content;
  let prefix = content.slice(0, array.end - 1);
  if (array.elements.length && !array.elements.hasTrailingComma) {
    const lastEnd = array.elements[array.elements.length - 1]!.end;
    prefix = prefix.slice(0, lastEnd) + "," + prefix.slice(lastEnd);
  }
  return prefix.trimEnd() + `\n    ${entry},\n  ` + content.slice(array.end - 1);
}

export function mergeConfigProperty(content: string, path: string, key: string, expression: string): string {
  const source = parse(content, path);
  const object = objectForConfig(source);
  const property = object.properties.find(item => item.name && propertyKey(source, item.name) === key);
  if (!property) {
    rejectInheritedEdit(source, object, key);
    return insertProperty(content, object, `${key}: ${expression}`);
  }
  let current: string;
  let start: number;
  if (ts.isPropertyAssignment(property)) {
    current = property.initializer.getText(source);
    start = property.initializer.getStart(source);
    if (current === expression || current.includes(`...${expression}`)) return content;
    const merged = key === "initialGlobals" ? `{ ...${expression}, ...${current} }` : `{ ...${current}, ...${expression} }`;
    return content.slice(0, start) + merged + content.slice(property.initializer.end);
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    current = property.name.text;
    return content.slice(0, property.getStart(source)) + `${key}: { ...${current}, ...${expression} }` + content.slice(property.end);
  }
  throw new SchematicsException(`Cannot safely edit ${key} in ${path}.`);
}

function namedAnnotation(source: ts.SourceFile, key: string): { expression?: ts.Expression; node: ts.Node } | undefined {
  let localName: string | undefined;
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause) return { node: statement };
      if (ts.isNamedExports(statement.exportClause)) {
        const field = statement.exportClause.elements.find(item => !item.isTypeOnly && item.name.text === key);
        if (field) {
          if (statement.moduleSpecifier) return { node: statement };
          localName = (field.propertyName ?? field.name).text;
        }
      }
    }
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) {
      const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === key);
      if (declaration) return declaration.initializer && (statement.declarationList.flags & ts.NodeFlags.Const)
        ? { node: declaration, expression: declaration.initializer } : { node: declaration };
    }
  }
  if (localName) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
      const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === localName);
      if (declaration?.initializer) return { node: declaration, expression: declaration.initializer };
    }
    return { node: source };
  }
  return undefined;
}

/** Preserve named preview annotations instead of forcing a default-export conversion. */
export function configurePreview(content: string, path: string): string {
  const source = parse(content, path);
  const withImport = addHelperImport(content);
  const importPrefix = withImport.slice(0, withImport.length - content.length);
  if (defaultExport(source)) {
    for (const key of ["loaders", "globalTypes", "initialGlobals"]) {
      if (namedAnnotation(source, key)) throw new SetupDiagnostic("PREVIEW_MIXED_EXPORTS", `Cannot safely edit ${path}: both default and named annotations may define ${key}. No files were written.`, "Combine the affected annotations explicitly or use manual integration.");
    }
    // Validate against the original source so diagnostic line numbers are not shifted by generated edits.
    addArrayEntry(content, path, "loaders", "angularI18nLoader");
    mergeConfigProperty(content, path, "globalTypes", "angularI18nGlobalTypes");
    mergeConfigProperty(content, path, "initialGlobals", "angularI18nInitialGlobals");
    content = addArrayEntry(content, path, "loaders", "angularI18nLoader");
    content = mergeConfigProperty(content, path, "globalTypes", "angularI18nGlobalTypes");
    return importPrefix + mergeConfigProperty(content, path, "initialGlobals", "angularI18nInitialGlobals");
  }
  if (exportSummary(source).includes("CommonJS") || namedAnnotation(source, "preview")) {
    throw new SetupDiagnostic("PREVIEW_EXPORT_UNSUPPORTED", `Cannot safely edit ${path}. Detected export forms: ${exportSummary(source)}. No files were written.`, "Use an ESM default preview object or local named annotation exports. CommonJS and named preview factories require manual integration.");
  }
  for (const key of ["loaders", "globalTypes", "initialGlobals"]) {
    const annotation = namedAnnotation(source, key);
    if (!annotation) continue;
    const initializer = annotation.expression ? unwrap(annotation.expression) : undefined;
    if (!initializer || (key === "loaders" && !ts.isArrayLiteralExpression(initializer))) {
      throw new SetupDiagnostic("PREVIEW_ANNOTATION_UNRESOLVED", `Cannot safely edit named ${key} at ${location(source, annotation.node)} (syntax: ${syntaxDescription(initializer)}). No files were written.`, "Use a local exported const array for loaders; re-exported, mutable or dynamic annotations require manual integration.");
    }
  }
  for (const [key, expression] of [["loaders", "angularI18nLoader"], ["globalTypes", "angularI18nGlobalTypes"], ["initialGlobals", "angularI18nInitialGlobals"]] as const) {
    const currentSource = parse(content, path);
    const annotation = namedAnnotation(currentSource, key);
    if (!annotation) {
      // Avoid declaring a second binding when an unexported/imported binding already exists.
      let conflict = false;
      const visit = (node: ts.Node): void => { if (ts.isIdentifier(node) && node.text === key) conflict = true; ts.forEachChild(node, visit); };
      visit(currentSource);
      if (conflict) throw new SetupDiagnostic("PREVIEW_BINDING_CONFLICT", `Cannot add named ${key} in ${path}: that identifier already occurs in the module. No files were written.`, `Export the existing ${key} explicitly or use manual integration.`);
      content += `\nexport const ${key} = ${key === "loaders" ? `[${expression}]` : expression};\n`;
      continue;
    }
    const initializer = annotation.expression ? unwrap(annotation.expression) : undefined;
    if (!initializer || (key === "loaders" && !ts.isArrayLiteralExpression(initializer))) {
      throw new SetupDiagnostic("PREVIEW_ANNOTATION_UNRESOLVED", `Cannot safely edit named ${key} at ${location(currentSource, annotation.node)} (syntax: ${syntaxDescription(initializer)}). No files were written.`, "Use a local exported const array for loaders; re-exported, mutable or dynamic annotations require manual integration.");
    }
    if (key === "loaders") content = appendArrayEntry(content, initializer as ts.ArrayLiteralExpression, expression, false, currentSource);
    else {
      const current = initializer.getText(currentSource);
      if (current === expression || current.includes(`...${expression}`)) continue;
      const merged = key === "initialGlobals" ? `{ ...${expression}, ...${current} }` : `{ ...${current}, ...${expression} }`;
      content = content.slice(0, initializer.getStart(currentSource)) + merged + content.slice(initializer.end);
    }
  }
  return importPrefix + content;
}

function insertProperty(content: string, object: ts.ObjectLiteralExpression, property: string): string {
  let prefix = content.slice(0, object.end - 1);
  if (object.properties.length && !object.properties.hasTrailingComma) {
    const lastEnd = object.properties[object.properties.length - 1]!.end;
    prefix = prefix.slice(0, lastEnd) + "," + prefix.slice(lastEnd);
  }
  return prefix.trimEnd() + `\n  ${property},\n` + content.slice(object.end - 1);
}

export function addHelperImport(content: string): string {
  const names = ["angularI18nLoader", "angularI18nGlobalTypes", "angularI18nInitialGlobals"];
  const source = parse(content, "preview.ts");
  const existing = source.statements.find(statement => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "./angular-i18n-tools");
  if (existing) {
    if (!ts.isImportDeclaration(existing) || !existing.importClause?.namedBindings || !ts.isNamedImports(existing.importClause.namedBindings)) throw new SchematicsException("Use named imports from ./angular-i18n-tools in preview configuration.");
    const imports = existing.importClause.namedBindings.elements.map(item => item.name.text);
    if (names.every(name => imports.includes(name))) return content;
    throw new SchematicsException("The existing ./angular-i18n-tools import is incomplete; review it before rerunning setup.");
  }
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`).test(content)) throw new SchematicsException(`Reserved setup name ${name} already exists in the preview. Review it before rerunning setup.`);
  }
  return `import { ${names.join(", ")} } from "./angular-i18n-tools";\n${content}`;
}

export class FrameworkDetectionError extends SchematicsException {
  constructor(message: string, readonly category: "non-angular" | "unresolved" | "missing") { super(message); }
}

export function requireAngularFramework(content: string, path: string): string {
  const source = parse(content, path);
  const object = objectForConfig(source);
  let field = propertyValue(source, object, "framework");
  if (field?.expression) {
    const framework = resolveConstant(source, field.expression);
    if (ts.isObjectLiteralExpression(framework)) field = propertyValue(source, framework, "name") ?? { node: framework };
  }
  const value = field?.expression ? stringValue(source, field.expression) : undefined;
  const packageName = value?.replaceAll("\\", "/").match(/(?:^|\/)(@storybook\/(?:angular-vite|angular))(?=$|\/)/)?.[1];
  if (packageName) return packageName;
  const category = value !== undefined ? "non-angular" : field ? "unresolved" : "missing";
  const reason = category === "non-angular"
    ? "The resolved package or path is not a supported Angular Storybook framework."
    : field?.inherited
      ? "The framework is inherited or overridden by a spread/imported configuration; it cannot be determined without executing project code."
      : field
        ? "The framework expression could not be resolved statically. Local const values and common package-resolution helpers are supported; arbitrary functions/imported values are not executed."
        : "No explicit framework or framework.name was found in the exported config.";
  throw new FrameworkDetectionError([
    `Cannot configure Angular Storybook at ${location(source, field?.node ?? object)}.`,
    `Found framework expression: ${syntaxDescription(field?.node)}.`,
    reason,
    'Supported packages: "@storybook/angular" and "@storybook/angular-vite".',
    'Examples: framework: { name: "@storybook/angular", options: {} } or framework: { name: getAbsolutePath("@storybook/angular"), options: {} }.',
    "Keep the framework your Angular Storybook actually uses; do not switch builders just to satisfy setup. For inherited/dynamic config, add the matching explicit framework override or use manual integration. No files were written."
  ].join("\n"), category);
}

export function exportsTranslationLoader(content: string): boolean {
  const source = parse(content, "locale-loader.ts");
  return source.statements.some(statement => {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      return statement.exportClause.elements.some(item => item.name.text === "loadTranslationsForLocale");
    }
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
    if (ts.isFunctionDeclaration(statement)) return statement.name?.text === "loadTranslationsForLocale";
    return ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === "loadTranslationsForLocale");
  });
}
