import { createBooking } from "@/lib/booking";
import { ConfigError } from "@/lib/env";
import { jsonError, jsonOk, localeOf, readJson } from "@/lib/http";
import { verifyQuote } from "@/lib/quote-token";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit("booking", ip, 8, 600))) return jsonError("rate_limited", 429);
  const body = await readJson(req);
  if (!body) return jsonError("bad_request");

  // Anti-robots : champ invisible rempli, ou formulaire envoyé en moins de 3 secondes.
  const elapsed = Number(body.elapsedMs);
  if ((typeof body.company === "string" && body.company.trim() !== "") || (Number.isFinite(elapsed) && elapsed < 3000)) {
    return jsonError("rejected", 400);
  }
  if (body.consent !== true) return jsonError("consent_required");

  try {
    const verified = verifyQuote(body.token);
    if (!verified.ok) return jsonError(verified.error === "expired" ? "quote_expired" : "quote_invalid");
    const idem = typeof body.idempotencyKey === "string" && /^[\w-]{8,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : `${ip}:${body.token}`;
    const result = await createBooking({
      payload: verified.payload,
      customer: {
        vehicle: body.vehicle,
        name: body.name,
        phone: body.phone,
        email: body.email,
        flight: body.flight,
        signName: body.signName,
        notes: body.notes,
      },
      source: "web",
      locale: localeOf(body.locale),
      idempotencyKey: `web:${idem}`,
    });
    if (!result.ok) return jsonError(result.error, result.error.startsWith("dispatch") ? 503 : 400);
    const b = result.booking;
    return jsonOk({ ref: b.ref, priceCents: b.priceCents, vehicle: b.vehicle, date: b.date, time: b.time, demo: !result.delivered });
  } catch (err) {
    console.error("[rydar] réservation", err);
    return jsonError(err instanceof ConfigError ? "not_configured" : "server_error", 500);
  }
}
