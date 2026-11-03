import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, workspaceRoot } from "./cli";
import { formatSetupError } from "./diagnostics";

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "angular-i18n-cli-"));
  fixtures.push(root);
  writeFileSync(join(root, "nx.json"), "{}");
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "@angular/core": "22.2.4", "@angular/localize": "22.2.4" } }));
  for (const name of ["shop", "admin"]) {
    mkdirSync(join(root, `apps/${name}/src`), { recursive: true });
    writeFileSync(join(root, `apps/${name}/project.json`), JSON.stringify({ name, projectType: "application", sourceRoot: `apps/${name}/src`, targets: { build: { executor: "@nx/angular:application", options: { browser: `apps/${name}/src/main.ts` } } } }));
    writeFileSync(join(root, `apps/${name}/src/main.ts`), "bootstrapApplication(AppComponent);\n");
  }
  return root;
}
afterEach(() => { vi.restoreAllMocks(); for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("standalone setup command", () => {
  it("finds the workspace root from inside an application", () => {
    const root = fixture();
    expect(workspaceRoot(join(root, "apps/shop/src"))).toBe(root);
  });
  it("runs setup for every selected application without a local generator install", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fixture();
    await runCli(["--all", "--skip-install"], root);
    expect(existsSync(join(root, "apps/shop/src/locale-loader.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/admin/src/locale-loader.ts"))).toBe(true);
  });
  it("supports a dry run and leaves the workspace unchanged", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fixture();
    const before = readFileSync(join(root, "apps/shop/project.json"), "utf8");
    await runCli(["--project=shop", "--dry-run"], root);
    expect(readFileSync(join(root, "apps/shop/project.json"), "utf8")).toBe(before);
    expect(existsSync(join(root, "apps/shop/src/locale-loader.ts"))).toBe(false);
  });
  it("does not leave partial files when a later selected application is unsupported", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fixture();
    const path = join(root, "apps/admin/src/main.ts");
    const before = readFileSync(path, "utf8");
    writeFileSync(join(root, "apps/shop/src/main.ts"), 'console.log("not a standalone bootstrap");');
    await expect(runCli(["--all", "--skip-install"], root)).rejects.toThrow("bootstrapApplication");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(existsSync(join(root, "apps/admin/src/locale-loader.ts"))).toBe(false);
  });
  it("rejects unknown projects before modifying either app", async () => {
    const root = fixture();
    await expect(runCli(["--project=shop,missing", "--skip-install"], root)).rejects.toThrow("not found");
    expect(existsSync(join(root, "apps/shop/src/locale-loader.ts"))).toBe(false);
  });
  it("finds and configures a package.json-only library from inside its source folder", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fixture();
    mkdirSync(join(root, "libs/ui/src"), { recursive: true });
    mkdirSync(join(root, "libs/ui/.storybook"));
    const pkg = '{"name":"@example/ui","nx":{}}';
    writeFileSync(join(root, "libs/ui/package.json"), pkg);
    writeFileSync(join(root, "libs/ui/.storybook/main.ts"), "export default { framework: { name: getAbsolutePath('@storybook/angular-vite') }, addons: [] };");
    await runCli(["storybook", "--project=@example/ui", "--dry-run"], join(root, "libs/ui/src"));
    expect(existsSync(join(root, "libs/ui/.storybook/locale-loader.ts"))).toBe(false);
    await runCli(["storybook", "--project=@example/ui", "--skip-install"], join(root, "libs/ui/src"));
    expect(existsSync(join(root, "libs/ui/.storybook/locale-loader.ts"))).toBe(true);
    expect(readFileSync(join(root, "libs/ui/package.json"), "utf8")).toBe(pkg);
    expect(existsSync(join(root, "libs/ui/project.json"))).toBe(false);
  });
  it("traces preview failures with version, project, file, stage and original cause without source contents", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fixture();
    mkdirSync(join(root, "apps/shop/.storybook"));
    writeFileSync(join(root, "apps/shop/.storybook/main.ts"), "export default { framework: '@storybook/angular-vite', addons: [] };");
    const preview = "export const loaders = getLoaders('SYNTHETIC_SECRET');";
    writeFileSync(join(root, "apps/shop/.storybook/preview.ts"), preview);
    let failure: unknown;
    try { await runCli(["storybook", "--project=shop", "--dry-run", "--verbose"], root); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    const report = formatSetupError(failure, true);
    expect(report).toContain('Project "shop"');
    expect(report).toContain("Update preview loaders and locale globals: apps/shop/.storybook/preview.ts");
    expect(report).toContain("PREVIEW_ANNOTATION_UNRESOLVED");
    expect(report).toContain("Caused by:");
    expect(report).not.toContain("SYNTHETIC_SECRET");
    const trace = logs.mock.calls.flat().join("\n");
    expect(trace).toContain("[setup] Generator");
    expect(trace).toContain("Node v");
    expect(trace).toContain("Selected projects: shop");
    expect(trace).not.toContain("SYNTHETIC_SECRET");
    expect(readFileSync(join(root, "apps/shop/.storybook/preview.ts"), "utf8")).toBe(preview);
    expect(existsSync(join(root, "apps/shop/src/locale-loader.ts"))).toBe(false);
  });
});
