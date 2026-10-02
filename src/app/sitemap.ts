import type { MetadataRoute } from "next";
import { PAGE_KEYS, pathFor, LEGAL_PAGES } from "@/i18n/routes";
import { siteUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const keys = ["home", ...PAGE_KEYS] as const;
  return keys.flatMap((key) =>
    (["fr", "en"] as const).map((locale) => ({
      url: `${base}${pathFor(key, locale)}`,
      changeFrequency: "monthly" as const,
      priority: key === "home" ? 1 : (LEGAL_PAGES as string[]).includes(key) ? 0.2 : 0.8,
      alternates: { languages: { "fr-FR": `${base}${pathFor(key, "fr")}`, en: `${base}${pathFor(key, "en")}` } },
    })),
  );
}
