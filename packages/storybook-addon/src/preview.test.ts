import { afterEach, describe, expect, it, vi } from "vitest";

const { on } = vi.hoisted(() => ({ on: vi.fn() }));
vi.mock("storybook/preview-api", () => ({ addons: { getChannel: () => ({ on }) } }));
vi.mock("storybook/internal/core-events", () => ({ GLOBALS_UPDATED: "globalsUpdated" }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

async function initializePreview(href: string) {
  const replace = vi.fn();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { href, search: new URL(href).search, replace },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }
  });
  await import("./preview");
  const update = on.mock.calls[0]![1] as (event: { globals: { locale: unknown } }) => void;
  return { replace, update };
}

describe("locale preview reload", () => {
  it.each(["en", "de"])("synchronizes stale French globals when switching to %s", async (locale) => {
    const { replace, update } = await initializePreview(
      "https://example.com/iframe.html?id=sample--default&viewMode=story&globals=locale:fr;theme:dark&locale=fr&args=name:Alex#preview"
    );
    update({ globals: { locale } });
    expect(replace).toHaveBeenCalledTimes(1);
    const target = new URL(replace.mock.calls[0]![0]);
    expect(target.searchParams.get("locale")).toBe(locale);
    expect(target.searchParams.get("globals")).toBe(`theme:dark;locale:${locale}`);
    expect(target.searchParams.get("id")).toBe("sample--default");
    expect(target.searchParams.get("viewMode")).toBe("story");
    expect(target.searchParams.get("args")).toBe("name:Alex");
    expect(target.hash).toBe("#preview");

    // A fresh preview initializes Storybook from these same URL globals.
    vi.resetModules();
    on.mockClear();
    const reloaded = await initializePreview(target.href);
    reloaded.update({ globals: { locale } });
    expect(reloaded.replace).not.toHaveBeenCalled();
  });

  it("adds globals when switching from a default URL", async () => {
    const { replace, update } = await initializePreview("https://example.com/iframe.html?id=sample--default");
    update({ globals: { locale: "fr" } });
    const target = new URL(replace.mock.calls[0]![0]);
    expect(target.searchParams.get("globals")).toBe("locale:fr");
    expect(target.searchParams.get("locale")).toBe("fr");
  });

  it("ignores unchanged or invalid locale updates", async () => {
    const { replace, update } = await initializePreview("https://example.com/iframe.html?locale=fr");
    update({ globals: { locale: "fr" } });
    update({ globals: { locale: undefined } });
    expect(replace).not.toHaveBeenCalled();
  });
});
