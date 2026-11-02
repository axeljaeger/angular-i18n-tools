import ts from "typescript";
import { SchematicsException } from "@angular-devkit/schematics";

function objectForConfig(source: ts.SourceFile): ts.ObjectLiteralExpression {
  const exported = source.statements.find(ts.isExportAssignment);
  let expression = exported?.expression;
  if (expression && ts.isIdentifier(expression)) {
    const name = expression.text;
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name);
      if (declaration?.initializer) expression = declaration.initializer;
    }
  }
  while (expression && (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression))) expression = expression.expression;
  if (expression && ts.isCallExpression(expression)) expression = expression.arguments[0];
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    throw new SchematicsException(`Cannot safely edit ${source.fileName}: expected an exported config object. See the manual Storybook setup guide.`);
  }
  return expression;
}

function parse(content: string, path: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

export function addArrayEntry(content: string, path: string, key: string, entry: string, addon = false): string {
  const source = parse(content, path);
  const object = objectForConfig(source);
  const property = object.properties.find(item => item.name?.getText(source).replace(/["']/g, "") === key);
  if (!property) return insertProperty(content, object, `${key}: [${entry}]`);
  if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) {
    throw new SchematicsException(`Cannot safely edit dynamic ${key} in ${path}. Configure it manually.`);
  }
  const array = property.initializer;
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
  const property = object.properties.find(item => item.name?.getText(source).replace(/["']/g, "") === key);
  if (!property) return insertProperty(content, object, `${key}: ${expression}`);
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

export function requireAngularFramework(content: string, path: string): void {
  const source = parse(content, path);
  const object = objectForConfig(source);
  const property = object.properties.find(item => item.name?.getText(source).replace(/["']/g, "") === "framework");
  let name: string | undefined;
  if (property && ts.isPropertyAssignment(property)) {
    const value = property.initializer;
    if (ts.isStringLiteral(value)) name = value.text;
    if (ts.isObjectLiteralExpression(value)) {
      const field = value.properties.find(item => item.name?.getText(source).replace(/["']/g, "") === "name");
      if (field && ts.isPropertyAssignment(field) && ts.isStringLiteral(field.initializer)) name = field.initializer.text;
    }
  }
  if (!["@storybook/angular", "@storybook/angular-vite"].includes(name ?? "")) {
    throw new SchematicsException(`Expected an existing Angular Storybook framework in ${path}. Dynamic or other frameworks need manual setup.`);
  }
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
