import "server-only";
import { haversineKm, isValidCoord } from "@/lib/geo";
import { searchKnownPlaces } from "@/lib/known-places";
import type { Locale, Place, PlaceKind } from "@/lib/types";

/**
 * Géocodage :
 *  1. lieux connus (aéroports, gares…) — instantané ;
 *  2. Géoplateforme IGN (adresses françaises, gratuit, sans clé) ;
 *  3. Photon / OpenStreetMap (hôtels, restaurants, lieux nommés).
 */

const GEOPF_URL = "https://data.geopf.fr/geocodage/search";
const PHOTON_URL = "https://photon.komoot.io/api/";
const PARIS = { lat: 48.8566, lon: 2.3522 };
const TIMEOUT_MS = 3500;

interface GeopfFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    id?: string;
    label?: string;
    name?: string;
    score?: number;
    postcode?: string;
    citycode?: string;
    city?: string;
    type?: string;
  };
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    countrycode?: string;
    type?: string;
  };
}

function coordsOf(f: { geometry?: { coordinates?: [number, number] } }): { lat: number; lon: number } | null {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  return isValidCoord(lat, lon) ? { lat: lat as number, lon: lon as number } : null;
}

export interface GeocodeHit {
  place: Place;
  score: number;
}

const GEOPF_KIND: Record<string, PlaceKind> = {
  housenumber: "address",
  street: "street",
  locality: "street",
  municipality: "city",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RYDAR-Prive/1.0 (+booking)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[rydar] géocodage indisponible:", url.split("?")[0], (err as Error).message);
    return null;
  }
}

export async function geocodeAddress(q: string, opts: { autocomplete: boolean; limit?: number }): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 5),
    autocomplete: opts.autocomplete ? "1" : "0",
    lat: String(PARIS.lat),
    lon: String(PARIS.lon),
    index: "address",
  });
  const json = await fetchJson<{ features?: GeopfFeature[] }>(`${GEOPF_URL}?${params}`);
  const hits: GeocodeHit[] = [];
  for (const f of json?.features ?? []) {
    const c = coordsOf(f);
    const p = f.properties ?? {};
    if (!c || !p.label) continue;
    const { lat, lon } = c;
    hits.push({
      score: p.score ?? 0,
      place: {
        id: `addr:${p.id ?? `${lat},${lon}`}`,
        label: p.label,
        kind: GEOPF_KIND[p.type ?? ""] ?? "address",
        lat,
        lon,
        postcode: p.postcode,
        citycode: p.citycode,
        city: p.city,
      },
    });
  }
  return hits;
}

const PHOTON_KEYS = new Set(["tourism", "amenity", "aeroway", "railway", "building", "office", "shop", "leisure", "historic", "public_transport"]);

export async function searchPoi(q: string, locale: Locale, limit = 4): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    q,
    limit: String(limit + 4),
    lang: locale,
    lat: String(PARIS.lat),
    lon: String(PARIS.lon),
    bbox: "-5.3,41.3,9.7,51.2",
  });
  const json = await fetchJson<{ features?: PhotonFeature[] }>(`${PHOTON_URL}?${params}`);
  const hits: GeocodeHit[] = [];
  for (const f of json?.features ?? []) {
    const c = coordsOf(f);
    const p = f.properties ?? {};
    if (!c || !p.name || p.countrycode?.toUpperCase() !== "FR") continue;
    const { lat, lon } = c;
    if (!p.osm_key || !PHOTON_KEYS.has(p.osm_key)) continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const tail = [street, [p.postcode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    hits.push({
      score: 0.6,
      place: {
        id: `osm:${p.osm_type ?? "N"}${p.osm_id ?? `${lat},${lon}`}`,
        label: tail ? `${p.name}, ${tail}` : p.name,
        kind: "poi",
        lat,
        lon,
        postcode: p.postcode,
        city: p.city,
      },
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

function dedupe(hits: GeocodeHit[]) {
  const out: GeocodeHit[] = [];
  for (const h of hits) {
    const dup = out.some(
      (o) => o.place.label.toLowerCase() === h.place.label.toLowerCase() || (o.place.kind === h.place.kind && haversineKm(o.place, h.place) < 0.03),
    );
    if (!dup) out.push(h);
  }
  return out;
}

/** Suggestions pour le champ d'adresse du site. */
export async function suggestPlaces(q: string, locale: Locale): Promise<Place[]> {
  const known = searchKnownPlaces(q, locale, 3);
  const [addresses, pois] = await Promise.all([
    geocodeAddress(q, { autocomplete: true, limit: 5 }),
    q.length >= 4 ? searchPoi(q, locale, 3) : Promise.resolve([]),
  ]);
  const precise = addresses.filter((h) => h.place.kind === "address");
  const other = addresses.filter((h) => h.place.kind !== "address");
  return dedupe([...known, ...precise, ...pois, ...other])
    .slice(0, 7)
    .map((h) => h.place);
}

/**
 * Résout une adresse dictée au téléphone. Retourne le meilleur résultat
 * et des alternatives si c'est ambigu.
 */
export async function resolveSpokenPlace(q: string, locale: Locale): Promise<{ best: Place | null; confident: boolean; candidates: Place[] }> {
  const known = searchKnownPlaces(q, locale, 3);
  if (known.length === 1 && known[0].score >= 1) return { best: known[0].place, confident: true, candidates: [] };

  const [addresses, pois] = await Promise.all([geocodeAddress(q, { autocomplete: false, limit: 4 }), searchPoi(q, locale, 3)]);
  const all = dedupe([...known, ...addresses, ...pois]);
  if (all.length === 0) return { best: null, confident: false, candidates: [] };

  const top = addresses[0];
  if (known.length > 1) {
    return { best: known[0].place, confident: false, candidates: all.slice(0, 4).map((h) => h.place) };
  }
  if (top && top.score >= 0.7 && (top.place.kind === "address" || top.place.kind === "street")) {
    const second = addresses[1];
    const clear = !second || top.score - second.score > 0.1 || haversineKm(top.place, second.place) < 0.2;
    return { best: top.place, confident: clear, candidates: clear ? [] : all.slice(0, 4).map((h) => h.place) };
  }
  if (known[0]) return { best: known[0].place, confident: known[0].score >= 1, candidates: all.slice(0, 4).map((h) => h.place) };
  const firstPoi = pois[0];
  if (firstPoi) return { best: firstPoi.place, confident: pois.length === 1, candidates: all.slice(0, 4).map((h) => h.place) };
  return { best: all[0].place, confident: false, candidates: all.slice(0, 4).map((h) => h.place) };
}

/** Adresse la plus proche d'une position (bouton "Ma position"). */
export async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: "1", index: "address" });
  const json = await fetchJson<{ features?: GeopfFeature[] }>(`https://data.geopf.fr/geocodage/reverse?${params}`);
  const f = json?.features?.[0];
  const c = f ? coordsOf(f) : null;
  const p = f?.properties;
  if (!c || !p?.label) return null;
  return {
    id: `addr:${p.id ?? `${c.lat},${c.lon}`}`,
    label: p.label,
    kind: GEOPF_KIND[p.type ?? ""] ?? "address",
    lat: c.lat,
    lon: c.lon,
    postcode: p.postcode,
    citycode: p.citycode,
    city: p.city,
  };
}
