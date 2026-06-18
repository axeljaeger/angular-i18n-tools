import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "./cli";

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
        expect.stringContaining("::warning file=app.component.html,line=1,col="),
        expect.stringContaining("title=missing-translation"),
        expect.stringContaining("missing-translation [de]:")
      ])
    );
    expect(log).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });
});

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "angular-i18n-tools-"));

  for (const [path, content] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}
