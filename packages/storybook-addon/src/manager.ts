import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { addons } from "storybook/manager-api";
import { ADDON_ID, LOCALE_GLOBAL } from "./constants";
import { createLocaleGate, readLocaleFromUrl, withLocale } from "./locale-url";

const previewFrameId = "storybook-preview-iframe";
const localeChanged = createLocaleGate();

interface GlobalsUpdatedEvent {
  globals?: Record<string, unknown>;
}

addons.register(ADDON_ID, () => {
  addons.getChannel().on(GLOBALS_UPDATED, (event: GlobalsUpdatedEvent) => {
    const locale = event.globals?.[LOCALE_GLOBAL];
    if (typeof locale !== "string" || typeof document === "undefined") {
      return;
    }

    const iframe = document.getElementById(previewFrameId);
    if (!isPreviewFrame(iframe) || iframe.src.length === 0) {
      return;
    }

    // The embedded browser does not apply a navigation started inside the preview iframe.
    // The manager is the parent of that iframe, so it navigates the frame directly.
    if (!localeChanged(readLocaleFromUrl(iframe.src), locale)) {
      return;
    }

    iframe.src = withLocale(iframe.src, locale);
  });
});

function isPreviewFrame(value: HTMLElement | null): value is HTMLIFrameElement {
  return value !== null && "src" in value;
}
