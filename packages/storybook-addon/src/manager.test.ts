import { afterEach, describe, expect, it, vi } from "vitest";

const { on, register } = vi.hoisted(() => ({ on: vi.fn(), register: vi.fn((_id: string, setup: () => void) => setup()) }));
vi.mock("storybook/manager-api", () => ({ addons: { register, getChannel: () => ({ on }) } }));
vi.mock("storybook/internal/core-events", () => ({ GLOBALS_UPDATED: "globalsUpdated" }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadManager(src: string) {
  const iframe = { src };
  vi.stubGlobal("document", { getElementById: () => iframe });
  await import("./manager");
  const update = on.mock.calls[0]![1] as (event: { globals: { locale: unknown } }) => void;
  return { iframe, update };
}

describe("locale manager reload", () => {
  it("navigates the preview iframe from the manager", async () => {
    const { iframe, update } = await loadManager(
      "https://example.com/iframe.html?id=sample--default&viewMode=story&globals=locale:de&args=name:Alex#preview"
    );

    update({ globals: { locale: "de" } });
    expect(iframe.src).toContain("globals=locale:de");
    expect(iframe.src).not.toContain("locale=fr");

    update({ globals: { locale: "fr" } });
    const target = new URL(iframe.src);
    expect(target.searchParams.get("locale")).toBe("fr");
    expect(target.searchParams.get("globals")).toBe("locale:fr");
    expect(target.searchParams.get("id")).toBe("sample--default");
    expect(target.searchParams.get("args")).toBe("name:Alex");
    expect(target.hash).toBe("#preview");
  });

  it("adopts the visible default locale before the first real switch", async () => {
    const { iframe, update } = await loadManager("https://example.com/iframe.html?id=sample--default");

    update({ globals: { locale: "en-US" } });
    expect(iframe.src).toBe("https://example.com/iframe.html?id=sample--default");

    update({ globals: { locale: "de" } });
    expect(iframe.src).toBe("https://example.com/iframe.html?id=sample--default&globals=locale%3Ade&locale=de");
  });
});
