import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyElevenLabsSignature } from "@/lib/agent/webhook";
import { signQuote, verifyQuote, type QuotePayload } from "@/lib/quote-token";
import { normalizePhone } from "@/lib/phone";

const payload: QuotePayload = {
  v: 1,
  service: "transfer",
  pickup: { id: "a", label: "A", kind: "address", lat: 48.85, lon: 2.35 },
  dropoff: { id: "b", label: "B", kind: "airport", lat: 49, lon: 2.55 },
  date: "2026-10-10",
  time: "10:00",
  hours: null,
  passengers: 1,
  luggage: 1,
  childSeats: 0,
  quote: {
    service: "transfer",
    fixed: true,
    quoteRequired: false,
    distanceKm: 30,
    durationMin: 45,
    options: [{ vehicle: "business", priceCents: 7500, available: true }],
    zones: { from: "paris", to: "cdg" },
  },
  exp: Date.now() + 60_000,
};

describe("devis signés", () => {
  it("accepte un devis intact", () => {
    const v = verifyQuote(signQuote(payload));
    expect(v.ok).toBe(true);
  });
  it("refuse un devis modifié", () => {
    const token = signQuote(payload);
    const [data, sig] = token.split(".");
    const tampered = JSON.parse(Buffer.from(data, "base64url").toString());
    tampered.quote.options[0].priceCents = 100;
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`;
    expect(verifyQuote(forged)).toEqual({ ok: false, error: "signature" });
  });
  it("refuse un devis expiré", () => {
    expect(verifyQuote(signQuote({ ...payload, exp: Date.now() - 1 }))).toEqual({ ok: false, error: "expired" });
  });
});

describe("signature ElevenLabs", () => {
  it("vérifie le HMAC", () => {
    const body = '{"type":"post_call_transcription"}';
    const t = Math.floor(Date.now() / 1000);
    const v0 = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
    expect(verifyElevenLabsSignature(body, `t=${t},v0=${v0}`, "whsec")).toBe(true);
    expect(verifyElevenLabsSignature(body + " ", `t=${t},v0=${v0}`, "whsec")).toBe(false);
    expect(verifyElevenLabsSignature(body, `t=${t - 3600},v0=${v0}`, "whsec")).toBe(false);
  });
});

describe("téléphones", () => {
  it("normalise en E.164", () => {
    expect(normalizePhone("06 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("0044 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("123")).toBeNull();
  });
});
