import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli";
const workspaces: string[] = [];
beforeEach(() => { vi.stubEnv("GITHUB_WORKSPACE", ""); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await Promise.all(workspaces.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("runCli", () => {
  it("returns success for complete catalogs", async () => {
    const root = await createWorkspace({
      "app.component.html": '<h1 i18n="Title@@home.title">Home</h1>',
      "messages.de.json": '{ "home.title": "Startseite" }'
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runCli([root])).toBe(0);
    expect(log).toHaveBeenCalledWith("Angular i18n catalogs are complete.");
    expect(error).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });

  it("returns failure for missing and orphaned translations", async () => {
    const root = await createWorkspace({
      "app.component.html": '<h1 i18n="Title@@home.title">Home</h1><p i18n="Intro@@home.intro">Intro</p>',
      "messages.de.json": '{ "home.title": "Startseite", "home.extra": "Extra" }'
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runCli([root])).toBe(1);
    expect(error.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing-translation [de]"),
        expect.stringContaining("extra-translation [de]")
      ])
    );

    log.mockRestore();
    error.mockRestore();
  });

  it("emits GitHub workflow annotations when requested", async () => {
    const root = await createWorkspace({
      "app.component.html": '<h1 i18n="Title@@home.title">Home</h1><p i18n="Intro@@home.intro">Intro</p>',
      "messages.de.json": '{ "home.title": "Startseite" }'
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await runCli(["--github-annotations", root])).toBe(1);
    expect(error.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("::error file=app.component.html,line=1,col="),
        expect.stringContaining("title=missing-translation"),
        expect.stringContaining("missing-translation [de]:")
      ])
    );
    expect(log).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });

  it("uses repository-relative annotation paths and writes a linked job summary for a nested project", async () => {
    const root = await createWorkspace({
      "apps/shop/view.html": '<h1 i18n="@@home.title">Home</h1>\n<button i18n="@@home.apply">Apply</button>',
      "apps/shop/messages.de.json": '{"translations":{"home.title":"Start","home.old":"Alt"}}'
    });
    vi.stubEnv("GITHUB_WORKSPACE", root);
    vi.stubEnv("GITHUB_STEP_SUMMARY", join(root, "summary.md"));
    vi.stubEnv("GITHUB_REPOSITORY", "example/project");
    vi.stubEnv("GITHUB_SHA", "abc123");
    vi.stubEnv("GITHUB_SERVER_URL", "https://github.com");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCli(["--github-annotations", "--github-summary", join(root, "apps/shop")])).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("file=apps/shop/view.html,line=2");
    const summary = await readFile(join(root, "summary.md"), "utf8");
    expect(summary).toContain("Failed: 2 findings");
    expect(summary).toContain("Missing translation: 1");
    expect(summary).toContain("Orphaned translation: 1");
    expect(summary).toContain("https://github.com/example/project/blob/abc123/apps/shop/view.html#L2");
    expect(summary).toContain("How to fix");
  });

  it("reports all source IDs as missing for a valid empty runtime catalog", async () => {
    const root = await createWorkspace({ "view.html": '<p i18n="@@hello">Hello</p>', "messages.de.json": '{"locale":"de","translations":{}}' });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCli([root])).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("missing-translation [de]");
  });

  it("refuses invalid catalogs without including their contents in the error", async () => {
    const root = await createWorkspace({ "messages.de.json": '{"secret":"SYNTHETIC_SECRET",' });
    await expect(runCli([root])).rejects.toThrow("Invalid runtime JSON catalog: messages.de.json");
    try { await runCli([root]); } catch (error) { expect(String(error)).not.toContain("SYNTHETIC_SECRET"); }
  });

  it("does not report success when the selected path contains no runtime catalogs", async () => {
    const root = await createWorkspace({ "view.html": '<h1 i18n="@@title">Title</h1>' });
    await expect(runCli([root])).rejects.toThrow("No messages.<locale>.json catalogs found");
  });

  it("limits annotations without losing the full finding count", async () => {
    const root = await createWorkspace({ "view.html": Array.from({ length: 15 }, (_, index) => `<p i18n="@@item.${index}">Item</p>`).join("\n"), "messages.de.json": '{"translations":{}}' });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await runCli(["--github-annotations", root])).toBe(1);
    expect(error).toHaveBeenCalledTimes(10);
    expect(log.mock.calls.flat().join("\n")).toContain("15 findings");
  });

  it("escapes file paths in annotations and summary tables", async () => {
    const root = await createWorkspace({ "view,odd|<x>.html": '<p i18n="@@hello">Hello</p>', "messages.de.json": '{"translations":{}}' });
    vi.stubEnv("GITHUB_STEP_SUMMARY", join(root, "summary.md"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runCli(["--github-annotations", "--github-summary", root]);
    expect(error.mock.calls.flat().join("\n")).toContain("file=view%2Codd|<x>.html");
    const summary = await readFile(join(root, "summary.md"), "utf8");
    expect(summary).toContain("view,odd&#124;&lt;x&gt;.html");
    expect(summary).not.toContain("<x>");
  });
});

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "angular-i18n-tools-"));
  workspaces.push(root);

  for (const [path, content] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}
