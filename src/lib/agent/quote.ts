import "server-only";
import { randomBytes } from "node:crypto";
import { BUSINESS } from "@/config/business";
import { PRICING, VEHICLES } from "@/config/pricing";
import { VEHICLE_TEXT } from "@/i18n/vehicles";
import { parseSpokenDate, parseSpokenTime } from "@/lib/agent/spoken";
import { resolveSpokenPlace } from "@/lib/geocoder";
import { buildQuote, cleanText } from "@/lib/quote-service";
import { verifyQuote, type QuotePayload } from "@/lib/quote-token";
import { kv } from "@/lib/store";
import { formatDateLong } from "@/lib/time";
import type { Locale } from "@/lib/types";

/**
 * Logique de l'outil "get_quote" de l'assistant téléphonique (ElevenLabs).
 * Les réponses sont rédigées pour le modèle de langage : courtes, explicites, avec consignes.
 */

export type AgentQuoteResult =
  { ok: false; body: Record<string, unknown> } | { ok: true; body: Record<string, unknown>; payload: QuotePayload | null; quoteId: string };

function fail(error: string, message: string, extra: Record<string, unknown> = {}): AgentQuoteResult {
  return { ok: false, body: { ok: false, error, message_for_agent: message, ...extra } };
}

const TIME_ERRORS: Record<string, string> = {
  time_invalid: "The date or time could not be understood. Ask the caller to repeat the date and the pickup time.",
  time_nonexistent: "That local time does not exist (daylight saving change). Ask for another time.",
  time_past: "That date/time is in the past. Re-check the date with the caller.",
  time_too_soon: `Bookings must be made at least ${BUSINESS.minLeadMinutes} minutes in advance. Offer a later time, or offer to transfer to a human for an urgent ride.`,
  time_too_far: `Bookings can only be made up to ${BUSINESS.maxAdvanceDays} days in advance.`,
};

export async function runAgentQuote(p: Record<string, unknown>): Promise<AgentQuoteResult> {
  const locale: Locale = p.language === "en" ? "en" : "fr";
  const service = p.service_type === "hourly" ? "hourly" : "transfer";

  const pickupText = cleanText(p.pickup_address, 200);
  const dropoffText = cleanText(p.dropoff_address, 200);
  if (!pickupText) return fail("missing_pickup", "Ask the caller for the pickup address.");
  if (service === "transfer" && !dropoffText) return fail("missing_dropoff", "Ask the caller for the destination address.");

  const date = parseSpokenDate(String(p.date ?? ""));
  const time = parseSpokenTime(String(p.time ?? ""));
  if (!date) return fail("invalid_date", "The date was not understood. Ask the caller for the date (day and month).");
  if (!time) return fail("invalid_time", "The pickup time was not understood. Ask the caller for the pickup time.");

  const [pickupRes, dropoffRes] = await Promise.all([
    resolveSpokenPlace(pickupText, locale),
    dropoffText ? resolveSpokenPlace(dropoffText, locale) : Promise.resolve(null),
  ]);
  if (!pickupRes.best) {
    return fail(
      "pickup_not_found",
      "The pickup address was not found. Ask the caller to repeat it with the street number, street name and city (or the airport / station / hotel name).",
    );
  }
  if (dropoffText && !dropoffRes?.best) {
    return fail(
      "dropoff_not_found",
      "The destination was not found. Ask the caller to repeat it with the street number, street name and city (or the airport / station / hotel name).",
    );
  }

  const passengers = Math.min(16, Math.max(1, Math.round(Number(p.passengers) || 1)));
  const luggage = Math.min(20, Math.max(0, Math.round(Number(p.luggage) || 0)));
  const childSeats = Math.min(PRICING.options.maxChildSeats, Math.max(0, Math.round(Number(p.child_seats) || 0)));
  const hours = service === "hourly" ? Math.min(PRICING.hourly.maxHours, Math.max(PRICING.hourly.minHours, Number(p.hours) || PRICING.hourly.minHours)) : null;

  const result = await buildQuote({
    service,
    pickup: pickupRes.best,
    dropoff: dropoffRes?.best ?? null,
    hours,
    date,
    time,
    passengers,
    luggage,
    childSeats,
  });
  if (!result.ok) {
    if (result.error === "same_place") return fail("same_place", "Pickup and destination look identical. Re-check the addresses.");
    return fail(result.error, TIME_ERRORS[result.error] ?? "The quote could not be computed. Re-check the details with the caller.");
  }
  const q = result.quote;

  const verified = verifyQuote(q.token);
  const quoteId = `Q${randomBytes(4).toString("hex").toUpperCase()}`;
  if (verified.ok) {
    await kv().set(`agentquote:${quoteId}`, JSON.stringify(verified.payload), BUSINESS.quoteValidityMinutes * 60 + 300);
  }

  const names = VEHICLE_TEXT[locale];
  const options = q.options.map((o) => ({
    vehicle: o.vehicle,
    name: names[o.vehicle].name,
    capacity: `${VEHICLES[o.vehicle].passengers} passengers, ${VEHICLES[o.vehicle].luggage} suitcases`,
    available: o.available,
    price_eur: o.priceCents === null ? null : o.priceCents / 100,
  }));

  const alternatives = [
    ...(!pickupRes.confident ? [{ field: "pickup", candidates: pickupRes.candidates.map((c) => c.label) }] : []),
    ...(dropoffRes && !dropoffRes.confident ? [{ field: "dropoff", candidates: dropoffRes.candidates.map((c) => c.label) }] : []),
  ];

  let instructions: string;
  if (q.quoteRequired) {
    instructions =
      q.quoteRequiredReason === "out_of_area"
        ? "This trip is outside our usual service area: no instant price. Offer to register it as a quote request (create_booking still works, price will be confirmed by our dispatch team)."
        : "No instant price for this trip (long distance). Offer to register it as a quote request (create_booking still works, price will be confirmed by our dispatch team).";
  } else {
    instructions =
      "Read back the addresses, date and time to confirm them, then present the available vehicle classes with their price (all taxes included). Mention only vehicles where available=true.";
  }
  if (alternatives.length)
    instructions = `Addresses may be ambiguous: confirm the exact address with the caller (see alternatives). If it is wrong, call get_quote again with the corrected address. ${instructions}`;

  return {
    ok: true,
    quoteId,
    payload: verified.ok ? verified.payload : null,
    body: {
      ok: true,
      quote_id: quoteId,
      service_type: service,
      pickup: q.pickup.label,
      dropoff: q.dropoff?.label ?? null,
      date: q.date,
      date_spoken: formatDateLong(q.date, locale),
      time: q.time,
      timezone: "Europe/Paris",
      hours: q.hours,
      passengers,
      luggage,
      distance_km: q.distanceKm,
      duration_min: q.durationMin,
      fixed_price: q.fixed,
      quote_required: q.quoteRequired,
      options,
      address_alternatives: alternatives,
      valid_for_minutes: BUSINESS.quoteValidityMinutes,
      instructions_for_agent: instructions,
    },
  };
}
