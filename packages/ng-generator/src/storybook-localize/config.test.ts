import { describe, expect, it } from "vitest";
import { addArrayEntry, configurePreview, FrameworkDetectionError, requireAngularFramework } from "./config";

const wrap = (framework: string) => `const config = { framework: ${framework} };\nexport default config;`;
describe("Angular Storybook framework recognition", () => {
  it.each([
    ["'@storybook/angular'", "@storybook/angular"],
    ['{ name: "@storybook/angular-vite", options: {} }', "@storybook/angular-vite"],
    ["{ name: getAbsolutePath('@storybook/angular-vite') }", "@storybook/angular-vite"],
    ["{ name: require.resolve('@storybook/angular') }", "@storybook/angular"],
    ["{ name: dirname(require.resolve(join('@storybook/angular-vite', 'package.json'))) }", "@storybook/angular-vite"],
    ["{ name: import.meta.resolve('@storybook/angular-vite') }", "@storybook/angular-vite"],
    ['{ name: "/workspace/node_modules/@storybook/angular-vite" }', "@storybook/angular-vite"]
  ])("accepts %s without executing the config", (expression, expected) => {
    expect(requireAngularFramework(wrap(expression), "libs/ui/.storybook/main.ts")).toBe(expected);
  });
  it("resolves typed const aliases, shorthand properties and defineConfig", () => {
    const source = `const packageName = '@storybook/angular-vite';
const framework = { name: getAbsolutePath(packageName) } as const;
const config = defineConfig(({ framework }) satisfies StorybookConfig);
export default (config);`;
    expect(requireAngularFramework(source, "main.ts")).toBe("@storybook/angular-vite");
  });
  it("resolves a local const spread but does not execute helper bodies", () => {
    const source = `function getAbsolutePath(value) { throw new Error('MUST NOT EXECUTE'); }
const base = { framework: { name: getAbsolutePath('@storybook/angular-vite') } };
export default { ...base, stories: [] };`;
    expect(requireAngularFramework(source, "main.ts")).toBe("@storybook/angular-vite");
  });
  it("includes syntax, location, supported values and recovery instructions without copying source", () => {
    const source = `export default {\n  framework: {\n    name: customResolver('angular')\n  }\n};`;
    expect(() => requireAngularFramework(source, "libs/ui/.storybook/main.ts")).toThrow("main.ts:3:11");
    expect(() => requireAngularFramework(source, "main.ts")).toThrow("CallExpression");
    try { requireAngularFramework(source, "main.ts"); } catch (error) { expect(String(error)).not.toContain("customResolver("); }
    expect(() => requireAngularFramework(source, "main.ts")).toThrow('"@storybook/angular-vite"');
    expect(() => requireAngularFramework(source, "main.ts")).toThrow("No files were written");
  });
  it("distinguishes an inherited framework from a missing one", () => {
    expect(() => requireAngularFramework('import base from "./base"; export default { ...base };', "main.ts")).toThrow("inherited or overridden");
    expect(() => requireAngularFramework('export default { stories: [] };', "main.ts")).toThrow("No explicit framework");
  });
  it("does not assume an earlier framework wins over an unknown trailing spread", () => {
    expect(() => requireAngularFramework('import base from "./base"; export default { framework:"@storybook/angular", ...base };', "main.ts")).toThrow("inherited or overridden");
  });
  it("reports non-Angular frameworks separately", () => {
    try { requireAngularFramework(wrap('"@storybook/react-vite"'), "main.ts"); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toBeInstanceOf(FrameworkDetectionError);
      expect((error as FrameworkDetectionError).category).toBe("non-angular");
      expect((error as Error).message).toContain("not a supported Angular Storybook framework");
    }
  });
  it("refuses to replace inherited addon settings silently", () => {
    expect(() => addArrayEntry('import base from "./base"; export default { ...base };', "main.ts", "addons", '"new-addon"')).toThrow("inherited addons");
  });
});

describe("config export diagnostics", () => {
  it("accepts a local default export alias", () => {
    expect(requireAngularFramework("const config = { framework: '@storybook/angular' }; export { config as default };", "main.ts")).toBe("@storybook/angular");
  });
  it.each([
    ["export const config = { framework: '@storybook/angular', privateSetting: 'SYNTHETIC_SECRET' };", "named variable export"],
    ["module.exports = { privateSetting: 'SYNTHETIC_SECRET' };", "CommonJS assignment"],
    ["// Empty config", "none"]
  ])("identifies the export form instead of reporting missing source", (content, form) => {
    try { requireAngularFramework(content, "libs/ui/.storybook/main.ts"); throw new Error("expected error"); }
    catch (error) {
      const message = String(error);
      expect(message).toContain("CONFIG_EXPORT_NOT_FOUND");
      expect(message).toContain("libs/ui/.storybook/main.ts:1:1");
      expect(message).toContain(form);
      expect(message).not.toContain("<missing>");
      expect(message).not.toContain("SYNTHETIC_SECRET");
    }
  });
  it("distinguishes imported default re-exports from absent exports", () => {
    expect(() => requireAngularFramework("export { default } from './base';", "main.ts")).toThrow("CONFIG_EXPORT_UNRESOLVED");
  });
  it("reports a syntax error at its actual location before trying export detection", () => {
    expect(() => requireAngularFramework("export default {\n framework: ;\n};", "main.ts")).toThrow("CONFIG_SYNTAX_ERROR");
  });
});

describe("named preview annotations", () => {
  it("preserves decorators, parameters and existing loaders and locale globals on repeated setup", () => {
    const content = `export const parameters = { layout: 'centered' };\nexport const decorators = [customDecorator];\nexport const loaders = [async () => ({ custom: true })];\nexport const globalTypes = { theme: {} };\nexport const initialGlobals = { theme: 'dark', locale: 'fr' };\n`;
    const output = configurePreview(content, "preview.ts");
    expect(output).toContain("export const parameters = { layout: 'centered' }");
    expect(output).toContain("export const decorators = [customDecorator]");
    expect(output).toContain("async () => ({ custom: true })");
    expect(output).toContain("angularI18nLoader");
    expect(output).toContain("...angularI18nGlobalTypes");
    expect(output).toContain("{ ...angularI18nInitialGlobals, ...{ theme: 'dark', locale: 'fr' } }");
    expect(configurePreview(output, "preview.ts")).toBe(output);
  });
  it("supports annotation export aliases without renaming existing bindings", () => {
    const content = "const customLoaders = []; export { customLoaders as loaders }; export const parameters = {};";
    const output = configurePreview(content, "preview.ts");
    expect(output).toContain("export { customLoaders as loaders }");
    expect(output).toContain("angularI18nLoader");
    expect(output).toContain("export const globalTypes = angularI18nGlobalTypes");
    expect(configurePreview(output, "preview.ts")).toBe(output);
  });
  it.each([
    "export { loaders } from './base';",
    "export const loaders = getLoaders();",
    "export let loaders = [];"
  ])("refuses dynamic annotations with a precise diagnostic", source => {
    expect(() => configurePreview(source, "libs/ui/.storybook/preview.ts")).toThrow("PREVIEW_ANNOTATION_UNRESOLVED");
  });
  it("does not silently convert CommonJS or mix default and named annotations", () => {
    expect(() => configurePreview("module.exports = {};", "preview.js")).toThrow("PREVIEW_EXPORT_UNSUPPORTED");
    expect(() => configurePreview("export const loaders = []; export default {};", "preview.ts")).toThrow("PREVIEW_MIXED_EXPORTS");
  });
});
