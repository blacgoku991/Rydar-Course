import { KNOWN_PLACES, type KnownPlace } from "@/config/places";
import { normalizeText } from "@/lib/geo";
import type { Locale, Place } from "@/lib/types";

const STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "the", "of", "to", "a", "au", "aux", "et", "and"]);

const INDEX = KNOWN_PLACES.map((p) => ({
  place: p,
  tokens: Array.from(
    new Set([...p.aliases, p.name.fr, p.name.en, p.city, p.id.replace(/-/g, " ")].flatMap((s) => normalizeText(s).split(" ")).filter(Boolean)),
  ),
}));

export function knownToPlace(p: KnownPlace, locale: Locale): Place {
  return {
    id: `known:${p.id}`,
    label: p.name[locale],
    kind: p.kind,
    lat: p.lat,
    lon: p.lon,
    postcode: p.postcode,
    citycode: p.citycode,
    city: p.city,
  };
}

export function getKnownPlace(id: string) {
  return KNOWN_PLACES.find((p) => p.id === id) ?? null;
}

/** Recherche dans les lieux connus. Tous les mots de la requête doivent correspondre. */
export function searchKnownPlaces(query: string, locale: Locale, limit = 4): { place: Place; score: number }[] {
  const qTokens = normalizeText(query)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
  if (qTokens.length === 0) return [];
  const results: { place: Place; score: number; popular: boolean }[] = [];
  for (const { place, tokens } of INDEX) {
    let score = 0;
    let all = true;
    for (const q of qTokens) {
      if (tokens.includes(q)) score += 1.2;
      else if (tokens.some((t) => t.startsWith(q))) score += q.length >= 3 ? 1 : 0.6;
      else {
        all = false;
        break;
      }
    }
    if (all) results.push({ place: knownToPlace(place, locale), score: score / qTokens.length, popular: !!place.popular });
  }
  return results
    .sort((a, b) => b.score - a.score || Number(b.popular) - Number(a.popular) || a.place.label.length - b.place.label.length)
    .slice(0, limit)
    .map(({ place, score }) => ({ place, score }));
}

export function popularPlaces(locale: Locale): Place[] {
  return KNOWN_PLACES.filter((p) => p.popular).map((p) => knownToPlace(p, locale));
}
