import { LOCALE_GLOBAL } from "./constants";

// The first globals event repeats the locale already on screen. Later events are real switches.
export function createLocaleGate(): (shown: string | undefined, next: string) => boolean {
  let applied: string | undefined;
  return (shown, next) => {
    if (shown === next || next === applied) {
      applied = next;
      return false;
    }
    if (shown === undefined && applied === undefined) {
      applied = next;
      return false;
    }
    applied = next;
    return true;
  };
}

export function readLocaleFromUrl(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }

  const queryLocale = url.searchParams.get(LOCALE_GLOBAL);
  if (queryLocale) {
    return queryLocale;
  }

  const entry = (url.searchParams.get("globals") ?? "")
    .split(";")
    .find((item) => item.startsWith(`${LOCALE_GLOBAL}:`));
  const value = entry?.slice(LOCALE_GLOBAL.length + 1);
  return value || undefined;
}

// Storybook reads the locale from the iframe URL before the manager channel is ready.
// Keep `globals` and `locale` identical so that startup cannot schedule a second reload.
export function withLocale(href: string, locale: string): string {
  const url = new URL(href);
  const globals = (url.searchParams.get("globals") ?? "")
    .split(";")
    .filter((entry) => entry.length > 0 && !entry.startsWith(`${LOCALE_GLOBAL}:`));
  globals.push(`${LOCALE_GLOBAL}:${locale}`);
  url.searchParams.set("globals", globals.join(";"));
  url.searchParams.set(LOCALE_GLOBAL, locale);
  return url.toString();
}
