import { describe, expect, it } from "vitest";
import { entitiesToHtml } from "@/lib/telegram/entities";
import { adminKeyboard, adminText, driverKeyboard, driverText, groupKeyboard, groupText, shortDate, shortPlace } from "@/lib/telegram/format";
import type { Ride } from "@/lib/rides";
import type { Booking } from "@/lib/types";

const booking: Booking = {
  ref: "RP-ABCDE",
  createdAt: "2026-10-02T08:00:00Z",
  source: "web",
  locale: "fr",
  service: "transfer",
  pickup: { id: "a", label: "12 Rue Houdan, 92160 Antony", kind: "address", lat: 48.75, lon: 2.3, postcode: "92160", city: "Antony" },
  dropoff: { id: "known:cdg-2e", label: "CDG 2E", kind: "airport", lat: 49, lon: 2.58 },
  date: "2026-10-10",
  time: "09:30",
  hours: null,
  passengers: 2,
  luggage: 1,
  childSeats: 0,
  vehicle: "business",
  priceCents: 7500,
  fixed: true,
  distanceKm: 31.5,
  durationMin: 45,
  customer: { name: "Jean <Dupont>", phone: "+33612345678" },
  flight: "AF1234",
};

const n = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const ride = (over: Partial<Ride> = {}): Ride => ({ booking, status: "open", log: [{ at: booking.createdAt, text: "Reçue (site)" }], ...over });

describe("fiche groupe", () => {
  it("est courte, sans données client, avec la part chauffeur", () => {
    const t = n(groupText(ride()));
    expect(t).toContain("SAM 10/10 · 09:30 · B");
    expect(t).toContain("ANTONY ➜ CDG T2E");
    expect(t).toContain("60 €");
    expect(t).not.toContain("Dupont");
    expect(t).not.toContain("+33");
    expect(t).not.toContain("75");
    expect(groupKeyboard(ride()).inline_keyboard[0][0].callback_data).toBe("rp:take:RP-ABCDE");
  });
  it("affiche le chauffeur et retire le bouton une fois prise", () => {
    const r = ride({ status: "taken", driver: { id: 7, name: "Ali" } });
    expect(groupText(r)).toContain("Prise par <b>Ali</b>");
    expect(groupKeyboard(r).inline_keyboard).toHaveLength(0);
  });
});

describe("fiche chauffeur et admin", () => {
  it("donne les coordonnées au chauffeur, échappées", () => {
    const r = ride({ status: "taken", driver: { id: 7, name: "Ali" } });
    expect(driverText(r)).toContain("Jean &lt;Dupont&gt;");
    expect(n(driverText(r))).toContain("Ta part : <b>60 €</b>");
    expect(driverKeyboard(r).inline_keyboard[1].map((b) => b.callback_data)).toEqual(["rp:done:RP-ABCDE", "rp:rel:RP-ABCDE"]);
  });
  it("montre prix client et commission à l'admin seulement", () => {
    const t = n(adminText(ride()));
    expect(t).toContain("Client : <b>75 €</b>");
    expect(t).toContain("Commission 20 % : <b>15 €</b>");
    expect(adminKeyboard(ride(), true).inline_keyboard[0][0].callback_data).toBe("rp:cancel_yes:RP-ABCDE");
  });
});

describe("libellés courts", () => {
  it("raccourcit les lieux", () => {
    expect(shortPlace({ id: "x", label: "8 Rue Royale, 75008 Paris", kind: "address", lat: 0, lon: 0, postcode: "75008" })).toBe("PARIS 8E");
    expect(shortPlace({ id: "known:gare-saint-lazare", label: "", kind: "station", lat: 0, lon: 0 })).toBe("GARE SAINT-LAZARE");
    expect(shortPlace({ id: "known:ory-4", label: "", kind: "airport", lat: 0, lon: 0 })).toBe("ORLY 4");
  });
  it("écrit AUJ. / DEMAIN / jour", () => {
    const now = new Date("2026-10-02T08:00:00Z");
    expect(shortDate("2026-10-02", now)).toBe("AUJ.");
    expect(shortDate("2026-10-03", now)).toBe("DEMAIN");
    expect(shortDate("2026-10-05", now)).toBe("LUN 05/10");
  });
});

describe("entités → HTML", () => {
  it("reconstruit le formatage imbriqué et les mentions", () => {
    const text = "✅ ATTRIBUÉE · Ali\nPrix 75 € <ok>";
    const html = entitiesToHtml(text, [
      { type: "bold", offset: 2, length: 9 },
      { type: "text_mention", offset: 14, length: 3, user: { id: 42, first_name: "Ali" } },
      { type: "bold", offset: 18, length: 4 },
      { type: "italic", offset: 18, length: 9 },
    ]);
    expect(html).toBe('✅ <b>ATTRIBUÉE</b> · <a href="tg://user?id=42">Ali</a>\n<i><b>Prix</b> 75 €</i> &lt;ok&gt;');
  });
});
