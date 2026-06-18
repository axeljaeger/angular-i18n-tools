import { describe, expect, it } from "vitest";
import { getLocalizationSemanticTokens } from "./syntax";

describe("getLocalizationSemanticTokens", () => {
  it("highlights template descriptions and custom IDs", () => {
    const text = '<h1 i18n="Settings dialog title@@settingsDialog.title">Settings</h1>';

    expect(tokenTexts(text, "html")).toEqual([
      { text: "Settings dialog title", tokenType: "string" },
      { text: "settingsDialog.title", tokenType: "variable" }
    ]);
  });

  it("highlights template meanings, descriptions, and custom IDs", () => {
    const text = '<button i18n-title="settings|Apply tooltip@@settingsDialog.applyTooltip"></button>';

    expect(tokenTexts(text, "html")).toEqual([
      { text: "settings", tokenType: "namespace" },
      { text: "Apply tooltip", tokenType: "string" },
      { text: "settingsDialog.applyTooltip", tokenType: "variable" }
    ]);
  });

  it("highlights localize descriptions and custom IDs", () => {
    const text = 'const subtitle = $localize`:Application subtitle@@app.subtitle:Sample workspace`;';

    expect(tokenTexts(text, "typescript")).toEqual([
      { text: "Application subtitle", tokenType: "string" },
      { text: "app.subtitle", tokenType: "variable" }
    ]);
  });

  it("highlights localize meanings, descriptions, and custom IDs", () => {
    const text = 'const label = $localize`:settings|Apply settings button@@settingsDialog.applyButton:Apply`;';

    expect(tokenTexts(text, "typescript")).toEqual([
      { text: "settings", tokenType: "namespace" },
      { text: "Apply settings button", tokenType: "string" },
      { text: "settingsDialog.applyButton", tokenType: "variable" }
    ]);
  });

  it("does not highlight unsupported languages", () => {
    expect(getLocalizationSemanticTokens('"home.title": "Home"', "json")).toEqual([]);
  });
});

function tokenTexts(text: string, languageId: string): Array<{ text: string; tokenType: string }> {
  const lines = text.split("\n");

  return getLocalizationSemanticTokens(text, languageId).map((token) => ({
    text: lines[token.line]!.slice(token.character, token.character + token.length),
    tokenType: token.tokenType
  }));
}
