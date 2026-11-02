import { describe, expect, it } from "vitest";
import { addArrayEntry, FrameworkDetectionError, requireAngularFramework } from "./config";

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
  it("includes the exact expression, location, supported values and recovery instructions", () => {
    const source = `export default {\n  framework: {\n    name: customResolver('angular')\n  }\n};`;
    expect(() => requireAngularFramework(source, "libs/ui/.storybook/main.ts")).toThrow("main.ts:3:11");
    expect(() => requireAngularFramework(source, "main.ts")).toThrow("customResolver('angular')");
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
      expect((error as Error).message).toContain("@storybook/react-vite");
    }
  });
  it("refuses to replace inherited addon settings silently", () => {
    expect(() => addArrayEntry('import base from "./base"; export default { ...base };', "main.ts", "addons", '"new-addon"')).toThrow("inherited addons");
  });
});
