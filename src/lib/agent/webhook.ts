import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérifie la signature ElevenLabs : en-tête "ElevenLabs-Signature: t=<unix>,v0=<hex>"
 * avec v0 = HMAC-SHA256(secret, `${t}.${corps brut}`). Tolérance : 30 minutes.
 */
export function verifyElevenLabsSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v0 = parts.v0;
  if (!Number.isFinite(t) || !v0) return false;
  if (Math.abs(nowSec - t) > 30 * 60) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v0);
  return a.length === b.length && timingSafeEqual(a, b);
}
