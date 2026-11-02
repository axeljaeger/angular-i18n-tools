import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, workspaceRoot } from "./cli";

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
});
