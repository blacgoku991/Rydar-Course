import { PRICING, VEHICLES, VEHICLE_IDS, type VehicleId } from "@/config/pricing";
import { minutesOfDay } from "@/lib/time";
import { isInServiceArea, zoneOf } from "@/lib/zones";
import type { QuoteRequest, QuoteResult, VehicleQuote } from "@/lib/types";

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
}

export function fitsVehicle(vehicle: VehicleId, passengers: number, luggage: number) {
  const v = VEHICLES[vehicle];
  return passengers <= v.passengers && luggage <= v.luggage;
}

function roundPrice(euros: number) {
  const step = PRICING.roundTo > 0 ? PRICING.roundTo : 1;
  return Math.ceil(euros / step - 1e-9) * step;
}

export function isNight(time: string) {
  const { start, end } = PRICING.night;
  const t = minutesOfDay(time);
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

export function findFixedFare(zoneA: string | null, zoneB: string | null) {
  if (!zoneA || !zoneB || zoneA === zoneB) return null;
  return PRICING.fixedFares.find((f) => (f.a === zoneA && f.b === zoneB) || (f.a === zoneB && f.b === zoneA)) ?? null;
}

/**
 * Calcule les prix pour chaque catégorie. `route` est requis pour un transfert
 * sans forfait ; s'il manque, le trajet passe sur devis.
 */
export function computeQuote(req: QuoteRequest, route: RouteInfo | null): QuoteResult {
  const childSeats = Math.max(0, Math.min(PRICING.options.maxChildSeats, Math.floor(req.childSeats || 0)));
  const optionsEuros = childSeats * PRICING.options.childSeat;
  const zoneFrom = zoneOf(req.pickup);
  const zoneTo = req.dropoff ? zoneOf(req.dropoff) : null;

  const capacity = (vehicle: VehicleId): Pick<VehicleQuote, "available" | "unavailableReason"> =>
    fitsVehicle(vehicle, req.passengers, req.luggage) ? { available: true } : { available: false, unavailableReason: "capacity" };

  const inArea = isInServiceArea(req.pickup) || (!!req.dropoff && isInServiceArea(req.dropoff));
  const base = {
    service: req.service,
    distanceKm: route ? Math.round(route.distanceKm * 10) / 10 : null,
    durationMin: route ? Math.round(route.durationMin) : null,
    zones: { from: zoneFrom, to: zoneTo },
  };

  const onRequest = (reason: QuoteResult["quoteRequiredReason"]): QuoteResult => ({
    ...base,
    fixed: false,
    quoteRequired: true,
    quoteRequiredReason: reason,
    options: VEHICLE_IDS.map((vehicle) => ({ vehicle, priceCents: null, ...capacity(vehicle) })),
  });

  if (!inArea) return onRequest("out_of_area");

  if (req.service === "hourly") {
    const hours = Math.max(PRICING.hourly.minHours, Math.min(PRICING.hourly.maxHours, Math.round((req.hours ?? PRICING.hourly.minHours) * 2) / 2));
    return {
      ...base,
      fixed: true,
      quoteRequired: false,
      options: VEHICLE_IDS.map((vehicle) => ({
        vehicle,
        priceCents: roundPrice(PRICING.hourly.rates[vehicle] * hours + optionsEuros) * 100,
        ...capacity(vehicle),
      })),
    };
  }

  const fare = findFixedFare(zoneFrom, zoneTo);
  if (fare) {
    return {
      ...base,
      fixed: true,
      quoteRequired: false,
      options: VEHICLE_IDS.map((vehicle) => ({
        vehicle,
        priceCents: roundPrice(fare.prices[vehicle] + optionsEuros) * 100,
        ...capacity(vehicle),
      })),
    };
  }

  if (!route) return onRequest("too_far");
  if (route.distanceKm > PRICING.maxDistanceKm) return onRequest("too_far");

  const nightFactor = PRICING.night.percent > 0 && isNight(req.time) ? 1 + PRICING.night.percent / 100 : 1;
  return {
    ...base,
    fixed: false,
    quoteRequired: false,
    options: VEHICLE_IDS.map((vehicle) => {
      const r = PRICING.perKm[vehicle];
      const metered = (r.base + r.perKm * route.distanceKm + r.perMinute * route.durationMin) * nightFactor;
      const euros = Math.max(r.minimum, metered) + optionsEuros;
      return { vehicle, priceCents: roundPrice(euros) * 100, ...capacity(vehicle) };
    }),
  };
}

/** Prix "à partir de" par catégorie pour un forfait donné (affichage). */
export function fixedFareFrom(zoneA: string, zoneB: string) {
  return findFixedFare(zoneA, zoneB)?.prices ?? null;
}

export function commissionSplit(priceCents: number, percent: number) {
  const commission = Math.round((priceCents * percent) / 100);
  return { commissionCents: commission, driverCents: priceCents - commission };
}
