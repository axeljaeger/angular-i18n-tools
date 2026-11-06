import { describe, expect, it } from "vitest";
import { createLocaleGate, readLocaleFromUrl, withLocale } from "./locale-url";

describe("locale gate", () => {
  it("ignores the locale that is already visible and accepts the next one", () => {
    const changed = createLocaleGate();
    expect(changed(undefined, "en-US")).toBe(false);
    expect(changed(undefined, "de")).toBe(true);
    expect(changed("de", "de")).toBe(false);
  });
});

describe("locale url", () => {
  it("reads the locale query before the globals entry", () => {
    expect(readLocaleFromUrl("https://example.com/iframe.html?globals=locale:fr&locale=de")).toBe("de");
  });

  it("reads the globals entry when the locale query is absent", () => {
    expect(readLocaleFromUrl("https://example.com/iframe.html?id=sample--default&globals=locale:de")).toBe("de");
  });

  it("keeps the other globals and the story identity when writing a locale", () => {
    const target = new URL(
      withLocale(
        "https://example.com/iframe.html?id=sample--default&viewMode=story&globals=locale:fr;theme:dark&locale=fr&args=name:Alex#preview",
        "de"
      )
    );

    expect(target.searchParams.get("locale")).toBe("de");
    expect(target.searchParams.get("globals")).toBe("theme:dark;locale:de");
    expect(target.searchParams.get("id")).toBe("sample--default");
    expect(target.searchParams.get("viewMode")).toBe("story");
    expect(target.searchParams.get("args")).toBe("name:Alex");
    expect(target.hash).toBe("#preview");
  });
});
