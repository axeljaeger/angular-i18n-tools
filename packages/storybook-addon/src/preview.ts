import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { DEFAULT_LOCALES, LOCALE_GLOBAL } from "./constants";
import { createLocaleGate, readLocaleFromUrl } from "./locale-url";

type StoryFunction = () => unknown;
interface StoryContext {
  globals: Record<string, unknown>;
}

type Decorator = (story: StoryFunction, context: StoryContext) => unknown;

interface Preview {
  globalTypes: Record<string, unknown>;
  decorators: Decorator[];
}

interface GlobalsUpdatedEvent {
  globals?: Record<string, unknown>;
}

const localeChanged = createLocaleGate();

installLocaleReloadHandler();

const withAngularI18nLocale: Decorator = (story, context) => {
  const locale = context.globals[LOCALE_GLOBAL];

  if (typeof document !== "undefined" && typeof locale === "string") {
    document.documentElement.lang = locale;
  }

  return story();
};

const preview: Preview = {
  globalTypes: {
    [LOCALE_GLOBAL]: {
      name: "Locale",
      description: "Locale used when the Storybook preview is loaded.",
      defaultValue: "en",
      toolbar: {
        icon: "globe",
        items: DEFAULT_LOCALES,
        showName: true
      }
    }
  },
  decorators: [withAngularI18nLocale]
};

export const globalTypes = preview.globalTypes;
export const decorators = preview.decorators;
export default preview;

function installLocaleReloadHandler(): void {
  if (typeof window === "undefined") {
    return;
  }

  addons.getChannel().on(GLOBALS_UPDATED, (event: GlobalsUpdatedEvent) => {
    const locale = event.globals?.[LOCALE_GLOBAL];
    if (typeof locale !== "string" || !localeChanged(readLocaleFromUrl(window.location.href), locale)) {
      return;
    }

    // Storybook re-renders the story while the manager reloads the iframe.
    // Hide that half-translated render so the page changes only once.
    if (document.body) {
      document.body.style.visibility = "hidden";
    }
  });
}
