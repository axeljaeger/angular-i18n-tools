import { afterEach, describe, expect, it, vi } from "vitest";

const { on } = vi.hoisted(() => ({ on: vi.fn() }));
vi.mock("storybook/preview-api", () => ({ addons: { getChannel: () => ({ on }) } }));
vi.mock("storybook/internal/core-events", () => ({ GLOBALS_UPDATED: "globalsUpdated" }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadPreview(href: string) {
  const body = { style: { visibility: "" } };
  vi.stubGlobal("window", { location: { href } });
  vi.stubGlobal("document", { body, documentElement: { lang: "" } });
  await import("./preview");
  const update = on.mock.calls[0]![1] as (event: { globals: { locale: unknown } }) => void;
  return { body, update };
}

describe("locale preview", () => {
  it("hides the current story only when the locale changes", async () => {
    const { body, update } = await loadPreview("https://example.com/iframe.html?globals=locale:de");

    update({ globals: { locale: "de" } });
    expect(body.style.visibility).toBe("");

    update({ globals: { locale: "en-US" } });
    expect(body.style.visibility).toBe("hidden");
  });

  it("ignores an invalid locale update", async () => {
    const { body, update } = await loadPreview("https://example.com/iframe.html?locale=fr");
    update({ globals: { locale: undefined } });
    expect(body.style.visibility).toBe("");
  });
});
