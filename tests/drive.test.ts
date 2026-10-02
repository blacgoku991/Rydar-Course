import { describe, expect, it } from "vitest";
import { drivePayload } from "@/lib/drive";
import { adminKeyboard, adminText } from "@/lib/telegram/format";
import type { Ride } from "@/lib/rides";
import type { Booking } from "@/lib/types";

const booking: Booking = {
  ref: "RP-ABCDE",
  createdAt: "2026-10-02T08:00:00Z",
  source: "voice",
  locale: "fr",
  service: "transfer",
  pickup: { id: "a", label: "12 Rue Houdan", kind: "address", lat: 48.75, lon: 2.3, postcode: "92160", city: "Antony" },
  dropoff: { id: "b", label: "Gare de Lyon, Paris", kind: "station", lat: 48.844, lon: 2.374, city: "Paris" },
  date: "2026-10-10",
  time: "09:30",
  hours: null,
  passengers: 2,
  luggage: 1,
  childSeats: 1,
  vehicle: "prestige",
  priceCents: 12000,
  fixed: true,
  distanceKm: 15,
  durationMin: 30,
  customer: { name: "Jean Dupont", phone: "+33612345678" },
  flight: "AF1234",
  signName: "DUPONT",
};

describe("Rydar Drive : corps de POST /rides", () => {
  it("respecte le schéma strict de l'API", () => {
    const p = drivePayload(booking);
    expect(Object.keys(p).sort()).toEqual(
      [
        "comment",
        "customer",
        "date",
        "dropoff",
        "external_reference",
        "flight_number",
        "luggage",
        "passengers",
        "pickup",
        "price_cents",
        "time",
        "vehicle_category",
      ].sort(),
    );
    expect(p.pickup).toEqual({ address: "12 Rue Houdan, 92160 Antony", lat: 48.75, lng: 2.3 });
    expect(p.dropoff.address).toBe("Gare de Lyon, Paris");
    expect(p.vehicle_category).toBe("first");
    expect(p.price_cents).toBe(12000);
    expect(p.external_reference).toBe("RP-ABCDE");
    expect(p.customer).toEqual({ name: "Jean Dupont", phone: "+33612345678" });
    expect(p.comment).toContain("assistant vocal");
    expect(p.comment).toContain("Siège(s) enfant : 1");
    expect(p.comment).toContain("« DUPONT »");
  });

  it("mise à disposition sans destination, sur devis, vol trop long", () => {
    const p = drivePayload({ ...booking, service: "hourly", hours: 4, dropoff: null, priceCents: null, flight: "Train de Lyon 9h" });
    expect(p.dropoff).toEqual(p.pickup);
    expect("price_cents" in p).toBe(false);
    expect("flight_number" in p).toBe(false);
    expect(p.comment).toContain("Mise à disposition 4 h");
    expect(p.comment).toContain("Prix sur devis");
    expect(p.comment).toContain("Vol / train : Train de Lyon 9h");
  });
});

describe("fiche admin Rydar Drive", () => {
  const ride: Ride = {
    booking,
    status: "taken",
    drive: { id: "8d0c", number: 1928, status: "ACCEPTED", driver: "Karim · Classe S noire · AB-123-CD" },
    log: [{ at: booking.createdAt, text: "Reçue (assistant vocal)" }],
  };

  it("affiche le statut Rydar Drive et le chauffeur", () => {
    const t = adminText(ride);
    expect(t).toContain("Rydar Drive</b> n° 1928");
    expect(t).toContain("Chauffeur attribué");
    expect(t).toContain("Karim");
  });

  it("propose Actualiser et Annuler, pas Remettre en ligne", () => {
    const buttons = adminKeyboard(ride).inline_keyboard.flat();
    expect(buttons.some((b) => b.callback_data === "rp:drv:RP-ABCDE")).toBe(true);
    expect(buttons.some((b) => b.callback_data === "rp:cancel:RP-ABCDE")).toBe(true);
    expect(buttons.some((b) => b.callback_data?.startsWith("rp:reopen"))).toBe(false);
    const done = adminKeyboard({ ...ride, drive: { ...ride.drive!, status: "COMPLETED" } }).inline_keyboard.flat();
    expect(done.some((b) => b.callback_data?.startsWith("rp:cancel"))).toBe(false);
  });
});
