import "server-only";
import { BUSINESS } from "@/config/business";
import { PRICING } from "@/config/pricing";
import { haversineKm, isValidCoord } from "@/lib/geo";
import { getKnownPlace, knownToPlace } from "@/lib/known-places";
import { computeQuote, findFixedFare } from "@/lib/pricing";
import { signQuote, type QuotePayload } from "@/lib/quote-token";
import { getRoute } from "@/lib/routing";
import { checkPickupTime, type PickupTimeError } from "@/lib/time";
import { zoneOf } from "@/lib/zones";
import type { Locale, Place, PlaceKind, QuoteResponse, ServiceType } from "@/lib/types";

const KINDS: PlaceKind[] = ["airport", "station", "landmark", "address", "street", "city", "poi"];

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Valide un lieu reçu du navigateur. Les lieux connus sont remplacés par la version serveur. */
export function sanitizePlace(raw: unknown, locale: Locale): Place | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = cleanText(r.id, 200);
  if (id.startsWith("known:")) {
    const known = getKnownPlace(id.slice(6));
    return known ? knownToPlace(known, locale) : null;
  }
  const label = cleanText(r.label, 300);
  if (!label || !isValidCoord(r.lat, r.lon)) return null;
  const postcode = typeof r.postcode === "string" && /^\d{5}$/.test(r.postcode) ? r.postcode : undefined;
  const citycode = typeof r.citycode === "string" && /^[0-9][0-9AB]\d{3}$/.test(r.citycode) ? r.citycode : undefined;
  return {
    id: id || `geo:${r.lat},${r.lon}`,
    label,
    kind: KINDS.includes(r.kind as PlaceKind) ? (r.kind as PlaceKind) : "address",
    lat: r.lat as number,
    lon: r.lon as number,
    postcode,
    citycode,
    city: cleanText(r.city, 100) || undefined,
  };
}

export type QuoteError =
  "invalid_pickup" | "invalid_dropoff" | "same_place" | "invalid_passengers" | "invalid_luggage" | "invalid_hours" | `time_${PickupTimeError}`;

export interface QuoteInput {
  service: ServiceType;
  pickup: Place | null;
  dropoff: Place | null;
  hours: number | null;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  childSeats: number;
}

function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function parseQuoteInput(body: Record<string, unknown>, locale: Locale): { ok: true; input: QuoteInput } | { ok: false; error: QuoteError } {
  const service: ServiceType = body.service === "hourly" ? "hourly" : "transfer";
  const pickup = sanitizePlace(body.pickup, locale);
  if (!pickup) return { ok: false, error: "invalid_pickup" };
  const dropoff = body.dropoff ? sanitizePlace(body.dropoff, locale) : null;
  if (service === "transfer" && !dropoff) return { ok: false, error: "invalid_dropoff" };
  const passengers = intIn(body.passengers, 1, 16);
  if (passengers === null) return { ok: false, error: "invalid_passengers" };
  const luggage = intIn(body.luggage ?? 0, 0, 20);
  if (luggage === null) return { ok: false, error: "invalid_luggage" };
  const childSeats = intIn(body.childSeats ?? 0, 0, PRICING.options.maxChildSeats) ?? 0;
  let hours: number | null = null;
  if (service === "hourly") {
    const h = Number(body.hours);
    if (!Number.isFinite(h) || h < PRICING.hourly.minHours || h > PRICING.hourly.maxHours) return { ok: false, error: "invalid_hours" };
    hours = Math.round(h * 2) / 2;
  }
  return {
    ok: true,
    input: {
      service,
      pickup,
      dropoff,
      hours,
      date: String(body.date ?? ""),
      time: String(body.time ?? ""),
      passengers,
      luggage,
      childSeats,
    },
  };
}

export async function buildQuote(input: QuoteInput, now = new Date()): Promise<{ ok: true; quote: QuoteResponse } | { ok: false; error: QuoteError }> {
  const when = checkPickupTime(input.date, input.time, now);
  if (!when.ok) return { ok: false, error: `time_${when.error}` };
  const pickup = input.pickup!;
  const dropoff = input.dropoff;
  if (input.service === "transfer" && dropoff && haversineKm(pickup, dropoff) < 0.3) return { ok: false, error: "same_place" };

  let route = null;
  if (input.service === "transfer" && dropoff) {
    const fixed = findFixedFare(zoneOf(pickup), zoneOf(dropoff));
    route = await getRoute(pickup, dropoff);
    if (route.source === "estimate" && !fixed && haversineKm(pickup, dropoff) > 60) {
      // Long trajet sans calcul routier fiable : on préfère le devis manuel.
      route = null;
    }
  }

  const result = computeQuote(
    {
      service: input.service,
      pickup,
      dropoff: input.service === "transfer" ? dropoff : (dropoff ?? null),
      hours: input.hours ?? undefined,
      date: input.date,
      time: input.time,
      passengers: input.passengers,
      luggage: input.luggage,
      childSeats: input.childSeats,
    },
    route,
  );

  const expiresAt = now.getTime() + BUSINESS.quoteValidityMinutes * 60_000;
  const payload: QuotePayload = {
    v: 1,
    service: input.service,
    pickup,
    dropoff: dropoff ?? null,
    date: input.date,
    time: input.time,
    hours: input.hours,
    passengers: input.passengers,
    luggage: input.luggage,
    childSeats: input.childSeats,
    quote: result,
    exp: expiresAt,
  };
  return {
    ok: true,
    quote: {
      ...result,
      token: signQuote(payload),
      expiresAt,
      pickup,
      dropoff: dropoff ?? null,
      date: input.date,
      time: input.time,
      hours: input.hours,
      passengers: input.passengers,
      luggage: input.luggage,
      childSeats: input.childSeats,
    },
  };
}
