import "@angular/localize/init";
import { componentWrapperDecorator, type Preview } from "@storybook/angular-vite";
import { loadTranslationsForLocale, type SupportedLocale } from "../src/locale-loader";

const preview: Preview = {
  decorators: [
    componentWrapperDecorator(
      (story) => `<p style="margin: 0 0 16px; color: #475569; font: 600 14px system-ui;">Angular application in NX workspace</p>${story}`
    )
  ],
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
