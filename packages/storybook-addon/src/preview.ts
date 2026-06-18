import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { DEFAULT_LOCALES, LOCALE_GLOBAL } from "./constants";

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

const selectedLocaleStorageKey = "angular-i18n-tools:selected-locale";
let selectedLocaleFallback: string | undefined;

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

  rememberSelectedLocale(readLocaleFromUrl() ?? "en");

  addons.getChannel().on(GLOBALS_UPDATED, (event: GlobalsUpdatedEvent) => {
    const locale = event.globals?.[LOCALE_GLOBAL];

    if (typeof locale !== "string" || locale === readRememberedLocale()) {
      return;
    }

    rememberSelectedLocale(locale);
    reloadPreviewForLocale(locale);
  });
}

function reloadPreviewForLocale(locale: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("locale", locale);
  window.location.replace(url);
}

function readLocaleFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get("locale") ?? undefined;
}

function readRememberedLocale(): string | undefined {
  try {
    return window.sessionStorage.getItem(selectedLocaleStorageKey) ?? selectedLocaleFallback;
  } catch {
    return selectedLocaleFallback;
  }
}

function rememberSelectedLocale(locale: string): void {
  selectedLocaleFallback = locale;

  try {
    window.sessionStorage.setItem(selectedLocaleStorageKey, locale);
  } catch {
    // Some embedded browser contexts can disable session storage.
  }
}
