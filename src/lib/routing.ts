import "server-only";
import { haversineKm } from "@/lib/geo";
import { kv } from "@/lib/store";
import type { RouteInfo } from "@/lib/pricing";

type LatLon = { lat: number; lon: number };

const TIMEOUT_MS = 4000;

/** Estimation de secours (distance à vol d'oiseau × coefficient routier). */
export function estimateRoute(a: LatLon, b: LatLon): RouteInfo {
  const crow = haversineKm(a, b);
  const distanceKm = crow * (crow < 20 ? 1.35 : crow < 100 ? 1.25 : 1.2);
  const speed = distanceKm < 15 ? 24 : distanceKm < 60 ? 42 : 85;
  return { distanceKm, durationMin: Math.max(5, (distanceKm / speed) * 60) };
}

async function ign(a: LatLon, b: LatLon): Promise<RouteInfo | null> {
  const params = new URLSearchParams({
    resource: "bdtopo-osrm",
    start: `${a.lon},${a.lat}`,
    end: `${b.lon},${b.lat}`,
    profile: "car",
    optimization: "fastest",
    distanceUnit: "meter",
    timeUnit: "second",
    getSteps: "false",
    getBbox: "false",
    geometryFormat: "geojson",
  });
  try {
    const res = await fetch(`https://data.geopf.fr/navigation/itineraire?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { distance?: number; duration?: number; distanceUnit?: string; timeUnit?: string };
    if (typeof json.distance !== "number" || typeof json.duration !== "number") return null;
    const km = json.distanceUnit === "meter" ? json.distance / 1000 : json.distance;
    const min = json.timeUnit === "second" ? json.duration / 60 : json.timeUnit === "hour" ? json.duration * 60 : json.duration;
    return { distanceKm: km, durationMin: min };
  } catch {
    return null;
  }
}

/**
 * Distance et durée routières. Ordre : cache → IGN Géoplateforme (gratuit, 5 req/s) → estimation.
 * Les durées "à vide" sont majorées pour tenir compte de la circulation francilienne.
 */
export async function getRoute(a: LatLon, b: LatLon): Promise<RouteInfo & { source: "ign" | "estimate" }> {
  const key = `route:${a.lat.toFixed(4)},${a.lon.toFixed(4)}:${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
  try {
    const cached = await kv().get(key);
    if (cached) return JSON.parse(cached);
  } catch {
    /* cache indisponible */
  }
  const fromIgn = await ign(a, b);
  if (fromIgn) {
    const result = { ...fromIgn, source: "ign" as const };
    result.durationMin = result.durationMin * (result.distanceKm < 60 ? 1.25 : 1.1);
    try {
      await kv().set(key, JSON.stringify(result), 86400 * 7);
    } catch {
      /* ignore */
    }
    return result;
  }
  return { ...estimateRoute(a, b), source: "estimate" };
}
