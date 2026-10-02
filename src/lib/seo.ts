import type { Metadata } from "next";
import { OG_LOCALE } from "@/i18n/config";
import { pathFor, type PageKey } from "@/i18n/routes";
import type { Locale } from "@/lib/types";

export function alternatesFor(key: PageKey | "home", locale: Locale): Metadata["alternates"] {
  return {
    canonical: pathFor(key, locale),
    languages: { "fr-FR": pathFor(key, "fr"), en: pathFor(key, "en"), "x-default": pathFor(key, "fr") },
  };
}

export function pageMetadata(key: PageKey | "home", locale: Locale, title: string, description: string, absoluteTitle = false): Metadata {
  // L'image de partage est générée par app/[lang]/opengraph-image.tsx ; on la répète ici
  // car un objet openGraph défini par la page remplace celui hérité.
  const image = { url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: "RYDAR Privé" };
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: alternatesFor(key, locale),
    openGraph: {
      title,
      description,
      url: pathFor(key, locale),
      locale: OG_LOCALE[locale],
      alternateLocale: locale === "fr" ? OG_LOCALE.en : OG_LOCALE.fr,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
