import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedSecret } from "@/lib/env";
import type { Place, QuoteResult, ServiceType } from "@/lib/types";

/**
 * Le devis est signé (HMAC) et renvoyé au client. À la réservation, le serveur
 * vérifie la signature et l'expiration : le prix ne peut pas être modifié
 * côté navigateur et un devis expiré est refusé.
 */
export interface QuotePayload {
  v: 1;
  service: ServiceType;
  pickup: Place;
  dropoff: Place | null;
  date: string;
  time: string;
  hours: number | null;
  passengers: number;
  luggage: number;
  childSeats: number;
  quote: QuoteResult;
  exp: number;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function sign(data: string) {
  return createHmac("sha256", derivedSecret("quote")).update(data).digest();
}

export function signQuote(payload: QuotePayload): string {
  const data = b64url(JSON.stringify(payload));
  return `${data}.${b64url(sign(data))}`;
}

export type VerifyError = "malformed" | "signature" | "expired";

export function verifyQuote(token: unknown, now = Date.now()): { ok: true; payload: QuotePayload } | { ok: false; error: VerifyError } {
  if (typeof token !== "string" || token.length > 8000) return { ok: false, error: "malformed" };
  const [data, sig] = token.split(".");
  if (!data || !sig) return { ok: false, error: "malformed" };
  const expected = sign(data);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: "signature" };
  let payload: QuotePayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (payload.v !== 1) return { ok: false, error: "malformed" };
  if (payload.exp < now) return { ok: false, error: "expired" };
  return { ok: true, payload };
}
