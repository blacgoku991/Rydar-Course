import en from "@/i18n/en";
import fr, { type Dictionary } from "@/i18n/fr";
import type { Locale } from "@/lib/types";

const DICTS: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale];
}

/** Remplace {cle} dans un texte. */
export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

export type { Dictionary };
