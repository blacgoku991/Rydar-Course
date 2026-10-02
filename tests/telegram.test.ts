import { describe, expect, it } from "vitest";
import { takerIdFrom } from "@/lib/telegram/central";
import { entitiesToHtml } from "@/lib/telegram/entities";
import { bookingMessageHtml, keyboardFor, statusFromText } from "@/lib/telegram/format";
import type { Booking } from "@/lib/types";

const booking: Booking = {
  ref: "RP-ABCDE",
  createdAt: "2026-10-02T08:00:00Z",
  source: "web",
  locale: "fr",
  service: "transfer",
  pickup: { id: "a", label: "12 Rue de Rivoli <Paris>", kind: "address", lat: 48.85, lon: 2.35 },
  dropoff: { id: "b", label: "CDG 2E", kind: "airport", lat: 49, lon: 2.58 },
  date: "2026-10-10",
  time: "09:30",
  hours: null,
  passengers: 2,
  luggage: 1,
  childSeats: 1,
  vehicle: "business",
  priceCents: 8500,
  fixed: true,
  distanceKm: 31.5,
  durationMin: 45,
  customer: { name: "Jean & Co", phone: "+33612345678" },
};

describe("message Telegram", () => {
  it("échappe le HTML et affiche la commission", () => {
    const html = bookingMessageHtml(booking);
    expect(html).toContain("12 Rue de Rivoli &lt;Paris&gt;");
    expect(html).toContain("Jean &amp; Co");
    expect(html).toContain("Commission 20 %");
    expect(html.split("\n")[0]).toContain("À ATTRIBUER");
  });
  it("lit le statut depuis la première ligne", () => {
    expect(statusFromText("🆕 NOUVELLE COURSE\n...")).toBe("new");
    expect(statusFromText("✅ ATTRIBUÉE · Ali\n...")).toBe("taken");
  });
  it("génère les boutons selon le statut", () => {
    const kb = keyboardFor("new", "RP-ABCDE", { route: "https://maps", whatsapp: "https://wa.me/33" });
    expect(kb.inline_keyboard[0][0].callback_data).toBe("rp:take:RP-ABCDE");
    expect(kb.inline_keyboard[1].map((b) => b.url)).toEqual(["https://maps", "https://wa.me/33"]);
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
  it("retrouve le chauffeur attribué", () => {
    const text = "✅ ATTRIBUÉE · Ali\nCorps";
    expect(takerIdFrom(text, [{ type: "text_mention", offset: 14, length: 3, user: { id: 42, first_name: "Ali" } }])).toBe(42);
    expect(takerIdFrom("✅ ATTRIBUÉE · Ali #123456789\nCorps", [])).toBe(123456789);
  });
});
