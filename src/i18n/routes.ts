import type { Locale } from "@/lib/types";

/** Pages publiques et leurs adresses dans chaque langue (SEO). */
export const PAGE_SLUGS = {
  cdg: { fr: "transfert-aeroport-cdg", en: "cdg-airport-transfer" },
  orly: { fr: "transfert-aeroport-orly", en: "orly-airport-transfer" },
  chauffeur: { fr: "chauffeur-paris", en: "private-chauffeur-paris" },
  hourly: { fr: "chauffeur-mise-a-disposition", en: "hourly-chauffeur" },
  legal: { fr: "mentions-legales", en: "legal-notice" },
  terms: { fr: "conditions-generales", en: "terms-and-conditions" },
  privacy: { fr: "confidentialite", en: "privacy-policy" },
} as const satisfies Record<string, Record<Locale, string>>;

export type PageKey = keyof typeof PAGE_SLUGS;
export const PAGE_KEYS = Object.keys(PAGE_SLUGS) as PageKey[];
export const SERVICE_PAGES: PageKey[] = ["cdg", "orly", "chauffeur", "hourly"];
export const LEGAL_PAGES: PageKey[] = ["legal", "terms", "privacy"];

export function pathFor(key: PageKey | "home", locale: Locale) {
  return key === "home" ? `/${locale}` : `/${locale}/${PAGE_SLUGS[key][locale]}`;
}

export function keyFromSlug(slug: string, locale: Locale): PageKey | null {
  return PAGE_KEYS.find((k) => PAGE_SLUGS[k][locale] === slug) ?? null;
}

/** Équivalent d'un chemin dans l'autre langue (sélecteur de langue). */
export function switchLocalePath(pathname: string, to: Locale) {
  const parts = pathname.split("/").filter(Boolean);
  const from = parts[0] as Locale | undefined;
  if (!from || (from !== "fr" && from !== "en")) return `/${to}`;
  if (parts.length === 1) return `/${to}`;
  const key = keyFromSlug(parts[1], from);
  return key ? pathFor(key, to) : `/${to}`;
}
