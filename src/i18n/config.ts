import type { Locale } from "@/lib/types";

export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(v: string): v is Locale {
  return (LOCALES as string[]).includes(v);
}

export const HTML_LANG: Record<Locale, string> = { fr: "fr-FR", en: "en" };
export const OG_LOCALE: Record<Locale, string> = { fr: "fr_FR", en: "en_GB" };
