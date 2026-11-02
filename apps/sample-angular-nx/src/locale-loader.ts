import { loadTranslations } from "@angular/localize";

const defaultLocales = new Set(["en", "en-US"]);
const loaders = {
  de: () => import("./locale/messages.de.json").then((module) => readTranslations(module.default)),
  fr: () => import("./locale/messages.fr.json").then((module) => readTranslations(module.default))
} as const;

type RuntimeLocale = keyof typeof loaders;
export type SupportedLocale = "en" | "en-US" | RuntimeLocale;

export async function loadRuntimeTranslations(): Promise<SupportedLocale> {
  const locale = readLocale();

  await loadTranslationsForLocale(locale);
  return locale;
}

export async function loadTranslationsForLocale(locale: SupportedLocale): Promise<void> {
  if (defaultLocales.has(locale)) {
    document.documentElement.lang = locale;
    return;
  }

  if (isRuntimeLocale(locale)) {
    const loader = loaders[locale];
    loadTranslations(await loader());
  }
  document.documentElement.lang = locale;
}

function readLocale(): SupportedLocale {
  const requested = new URLSearchParams(globalThis.location.search).get("locale");

  if (requested === "en" || requested === "en-US" || requested === "de" || requested === "fr") {
    return requested;
  }

  return "en-US";
}

function isRuntimeLocale(locale: SupportedLocale): locale is RuntimeLocale {
  return locale === "de" || locale === "fr";
}

function readTranslations(value: unknown): Record<string, string> {
  if (isTranslationRecord(value)) {
    return value;
  }

  if (isRecord(value) && isTranslationRecord(value.translations)) {
    return value.translations;
  }

  throw new Error("Expected Angular runtime translation JSON.");
}

function isTranslationRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
