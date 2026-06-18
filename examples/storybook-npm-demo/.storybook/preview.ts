import type { Preview } from "@storybook/angular";
import { loadTranslationsForLocale, type SupportedLocale } from "../src/locale-loader";

const preview: Preview = {
  loaders: [
    async (context) => {
      const locale = context.globals.locale;

      if (typeof locale === "string" && isSupportedLocale(locale)) {
        await loadTranslationsForLocale(locale);
      }
    }
  ]
};

export default preview;

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return locale === "en" || locale === "en-US" || locale === "de" || locale === "fr";
}
