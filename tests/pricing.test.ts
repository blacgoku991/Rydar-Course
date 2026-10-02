import { describe, expect, it } from "vitest";
import { computeQuote, commissionSplit, isNight } from "@/lib/pricing";
import { zoneOf } from "@/lib/zones";
import type { Place, QuoteRequest } from "@/lib/types";

const rivoli: Place = { id: "a", label: "12 Rue de Rivoli, 75004 Paris", kind: "address", lat: 48.8556, lon: 2.3593, postcode: "75004", citycode: "75104" };
const cdg2e: Place = { id: "known:cdg-2e", label: "CDG 2E", kind: "airport", lat: 49.0046, lon: 2.5839, postcode: "95700", citycode: "95527" };
const orly: Place = { id: "known:ory-4", label: "Orly 4", kind: "airport", lat: 48.7249, lon: 2.3607, postcode: "94390", citycode: "94054" };
const lyon: Place = { id: "l", label: "Lyon", kind: "city", lat: 45.764, lon: 4.8357, postcode: "69001" };
const marseille: Place = { id: "m", label: "Marseille", kind: "city", lat: 43.2965, lon: 5.3698, postcode: "13001" };

const base = (over: Partial<QuoteRequest>): QuoteRequest => ({
  service: "transfer",
  pickup: rivoli,
  dropoff: cdg2e,
  date: "2026-10-10",
  time: "10:00",
  passengers: 2,
  luggage: 2,
  childSeats: 0,
  ...over,
});

describe("zones", () => {
  it("détecte Paris, CDG et Orly", () => {
    expect(zoneOf(rivoli)).toBe("paris");
    expect(zoneOf(cdg2e)).toBe("cdg");
    expect(zoneOf(orly)).toBe("orly");
  });
  it("refuse un faux code postal parisien loin de Paris", () => {
    expect(zoneOf({ ...lyon, postcode: "75001" })).toBeNull();
  });
});

describe("computeQuote", () => {
  it("applique le forfait Paris → CDG dans les deux sens", () => {
    const q = computeQuote(base({}), { distanceKm: 31, durationMin: 50 });
    expect(q.fixed).toBe(true);
    expect(q.options.find((o) => o.vehicle === "business")?.priceCents).toBe(7500);
    const back = computeQuote(base({ pickup: cdg2e, dropoff: rivoli }), null);
    expect(back.options.find((o) => o.vehicle === "business")?.priceCents).toBe(7500);
  });

  it("ajoute les sièges enfant", () => {
    const q = computeQuote(base({ childSeats: 2 }), null);
    expect(q.options.find((o) => o.vehicle === "business")?.priceCents).toBe(9500);
  });

  it("marque les véhicules trop petits comme indisponibles", () => {
    const q = computeQuote(base({ passengers: 5, luggage: 4 }), null);
    expect(q.options.find((o) => o.vehicle === "business")?.available).toBe(false);
    expect(q.options.find((o) => o.vehicle === "van")?.available).toBe(true);
  });

  it("utilise le tarif kilométrique avec minimum hors forfait", () => {
    const short = computeQuote(base({ dropoff: { ...rivoli, id: "b", lat: 48.86, lon: 2.34 } }), { distanceKm: 2, durationMin: 10 });
    expect(short.fixed).toBe(false);
    expect(short.options.find((o) => o.vehicle === "business")?.priceCents).toBe(5000);
    const long = computeQuote(base({ dropoff: lyon }), { distanceKm: 465, durationMin: 280 });
    // 12 + 1.9*465 + 0.45*280 = 1021.5 → 1022 €
    expect(long.options.find((o) => o.vehicle === "business")?.priceCents).toBe(102200);
  });

  it("passe sur devis hors zone desservie", () => {
    const q = computeQuote(base({ pickup: lyon, dropoff: marseille }), { distanceKm: 315, durationMin: 190 });
    expect(q.quoteRequired).toBe(true);
    expect(q.quoteRequiredReason).toBe("out_of_area");
    expect(q.options.every((o) => o.priceCents === null)).toBe(true);
  });

  it("passe sur devis sans itinéraire", () => {
    const q = computeQuote(base({ dropoff: lyon }), null);
    expect(q.quoteRequired).toBe(true);
  });

  it("calcule la mise à disposition", () => {
    const q = computeQuote(base({ service: "hourly", dropoff: null, hours: 3 }), null);
    expect(q.options.find((o) => o.vehicle === "business")?.priceCents).toBe(19500);
    const min = computeQuote(base({ service: "hourly", dropoff: null, hours: 1 }), null);
    expect(min.options.find((o) => o.vehicle === "business")?.priceCents).toBe(13000);
  });
});

describe("divers", () => {
  it("répartit la commission", () => {
    expect(commissionSplit(7500, 20)).toEqual({ commissionCents: 1500, driverCents: 6000 });
  });
  it("détecte la nuit sur une plage qui passe minuit", () => {
    expect(isNight("23:30")).toBe(true);
    expect(isNight("05:59")).toBe(true);
    expect(isNight("06:00")).toBe(false);
  });
});
