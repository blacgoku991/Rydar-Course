import "server-only";
import { randomInt } from "node:crypto";
import { VEHICLE_IDS, type VehicleId } from "@/config/pricing";
import { DriveError, driveConfigured, pushToDrive, type DriveRide } from "@/lib/drive";
import { env } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { cleanText } from "@/lib/quote-service";
import type { QuotePayload } from "@/lib/quote-token";
import { kv } from "@/lib/store";
import { telegramConfigured } from "@/lib/telegram/api";
import { postBookingToCentral } from "@/lib/telegram/central";
import type { Booking, BookingSource, Locale } from "@/lib/types";

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const BOOKING_TTL = 60 * 60 * 24 * 90;

export function newRef() {
  let s = "";
  for (let i = 0; i < 5; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `RP-${s}`;
}

export type BookingError =
  "invalid_vehicle" | "vehicle_unavailable" | "invalid_name" | "invalid_phone" | "invalid_email" | "dispatch_unavailable" | "dispatch_failed";

export interface CustomerInput {
  vehicle: unknown;
  name: unknown;
  phone: unknown;
  email?: unknown;
  flight?: unknown;
  signName?: unknown;
  notes?: unknown;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function validateCustomer(input: CustomerInput, payload: QuotePayload) {
  const vehicle = input.vehicle as VehicleId;
  if (!VEHICLE_IDS.includes(vehicle)) return { ok: false as const, error: "invalid_vehicle" as const };
  const option = payload.quote.options.find((o) => o.vehicle === vehicle);
  if (!option || !option.available) return { ok: false as const, error: "vehicle_unavailable" as const };
  const name = cleanText(input.name, 80);
  if (name.length < 2) return { ok: false as const, error: "invalid_name" as const };
  const phone = normalizePhone(cleanText(input.phone, 40));
  if (!phone) return { ok: false as const, error: "invalid_phone" as const };
  const email = cleanText(input.email, 254);
  if (email && !EMAIL_RE.test(email)) return { ok: false as const, error: "invalid_email" as const };
  return {
    ok: true as const,
    value: {
      vehicle,
      priceCents: option.priceCents,
      name,
      phone,
      email: email || undefined,
      flight: cleanText(input.flight, 30).toUpperCase() || undefined,
      signName: cleanText(input.signName, 60) || undefined,
      notes: cleanText(input.notes, 600) || undefined,
    },
  };
}

/**
 * Crée la réservation et la transmet : Rydar Drive en priorité (dispatch des chauffeurs),
 * sinon le groupe Telegram. La fiche admin Telegram est envoyée dans les deux cas.
 * Idempotent : la même clé renvoie la même réservation (double clic, reprise d'appel…).
 */
export async function createBooking(args: {
  payload: QuotePayload;
  customer: CustomerInput;
  source: BookingSource;
  locale: Locale;
  idempotencyKey: string;
  conversationId?: string;
  test?: boolean;
}): Promise<{ ok: true; booking: Booking; duplicate: boolean; delivered: boolean } | { ok: false; error: BookingError }> {
  const check = validateCustomer(args.customer, args.payload);
  if (!check.ok) return check;
  const c = check.value;
  const store = kv();
  const idemKey = `idem:${args.idempotencyKey.slice(0, 200)}`;

  const findExisting = async () => {
    const existingRef = await store.get(idemKey).catch(() => null);
    if (!existingRef) return null;
    const raw = await store.get(`booking:${existingRef}`).catch(() => null);
    return raw ? (JSON.parse(raw) as Booking) : null;
  };
  const existing = await findExisting();
  if (existing) return { ok: true, booking: existing, duplicate: true, delivered: true };

  // Verrou : une requête identique déjà en cours → on attend son résultat.
  const locked = await store.setNX(`${idemKey}:lock`, "1", 30).catch(() => true);
  if (!locked) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const done = await findExisting();
      if (done) return { ok: true, booking: done, duplicate: true, delivered: true };
    }
    return { ok: false, error: "dispatch_failed" };
  }

  let ref = newRef();
  for (let i = 0; i < 5 && !(await store.setNX(`ref:${ref}`, "1", BOOKING_TTL).catch(() => true)); i++) ref = newRef();

  const p = args.payload;
  const booking: Booking = {
    ref,
    createdAt: new Date().toISOString(),
    source: args.source,
    locale: args.locale,
    service: p.service,
    pickup: p.pickup,
    dropoff: p.dropoff,
    date: p.date,
    time: p.time,
    hours: p.hours,
    passengers: p.passengers,
    luggage: p.luggage,
    childSeats: p.childSeats,
    vehicle: c.vehicle,
    priceCents: c.priceCents,
    fixed: p.quote.fixed,
    distanceKm: p.quote.distanceKm,
    durationMin: p.quote.durationMin,
    customer: { name: c.name, phone: c.phone, email: c.email },
    flight: c.flight,
    signName: c.signName,
    notes: c.notes,
    conversationId: args.conversationId,
  };

  let delivered = false;
  // 1. Rydar Drive (jamais pour une course test : elle partirait chez de vrais chauffeurs).
  let drive: DriveRide | undefined;
  let driveError: string | undefined;
  if (driveConfigured() && !args.test) {
    try {
      drive = await pushToDrive(booking);
      delivered = true;
    } catch (err) {
      driveError = err instanceof DriveError ? `${err.code} : ${err.message}` : String(err);
      console.error("[rydar] envoi Rydar Drive impossible", ref, driveError);
    }
  }

  // 2. Telegram : fiche admin (+ groupe chauffeurs si Rydar Drive n'a pas pris la course).
  if (telegramConfigured()) {
    try {
      await postBookingToCentral(booking, { test: args.test, drive, driveError });
      delivered = true;
    } catch (err) {
      console.error("[rydar] envoi Telegram impossible", err);
      if (!delivered) {
        await store.del(`${idemKey}:lock`).catch(() => undefined);
        return { ok: false, error: "dispatch_failed" };
      }
    }
  } else if (driveError) {
    await store.del(`${idemKey}:lock`).catch(() => undefined);
    return { ok: false, error: "dispatch_failed" };
  }

  if (!delivered && env.isProd) {
    console.error("[rydar] ni Rydar Drive ni Telegram configuré : réservation refusée", booking.ref);
    return { ok: false, error: "dispatch_unavailable" };
  }
  if (!delivered) console.info("[rydar] (dev) aucune centrale configurée — réservation simulée :\n", JSON.stringify(booking, null, 2));

  try {
    await store.set(`booking:${ref}`, JSON.stringify(booking), BOOKING_TTL);
    await store.set(idemKey, ref, 60 * 60 * 24);
    if (args.conversationId) await store.set(`conv:${args.conversationId}`, ref, 60 * 60 * 24 * 7);
  } catch (err) {
    console.error("[rydar] stockage réservation", err);
  }
  return { ok: true, booking, duplicate: false, delivered };
}
