import { isAgentRequest, toolParams } from "@/lib/agent/auth";
import { runAgentQuote } from "@/lib/agent/quote";
import { createBooking } from "@/lib/booking";
import { readJson } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { cleanText } from "@/lib/quote-service";
import type { QuotePayload } from "@/lib/quote-token";
import { kv } from "@/lib/store";
import type { Locale } from "@/lib/types";

/** Outil "create_booking" appelé par l'assistant téléphonique. */

function reply(ok: boolean, data: Record<string, unknown>) {
  return Response.json({ ok, ...data });
}

/** "RP-7K3Q9" → "R, P, 7, K, 3, Q, 9" pour une lecture claire au téléphone. */
function spell(ref: string) {
  return ref.replace(/-/g, "").split("").join(", ");
}

const ERRORS: Record<string, string> = {
  invalid_vehicle: "Unknown vehicle class. Use one of: business, van, prestige.",
  vehicle_unavailable: "This vehicle class cannot carry that many passengers or suitcases. Offer another available class.",
  invalid_name: "Ask the caller for their full name.",
  invalid_phone: "The phone number is invalid. Ask the caller for a phone number where our team can reach them (with country code if not French).",
  invalid_email: "The email looks invalid; you can leave it empty.",
  dispatch_unavailable:
    "The booking could not be transmitted. Apologise, tell the caller our team will call them back shortly, and offer a transfer to a human if available.",
  dispatch_failed:
    "The booking could not be transmitted. Apologise, tell the caller our team will call them back shortly, and offer a transfer to a human if available.",
};

export async function POST(req: Request) {
  if (!isAgentRequest(req)) return new Response("forbidden", { status: 403 });
  const body = await readJson(req);
  if (!body) return reply(false, { error: "bad_request", message_for_agent: "Invalid request." });
  const p = toolParams(body);
  const locale: Locale = p.language === "en" ? "en" : "fr";
  const conversationId = cleanText(p.conversation_id, 100) || undefined;

  try {
    // 1. Devis enregistré par get_quote ; sinon on le recalcule à partir des détails du trajet.
    const quoteId = cleanText(p.quote_id, 20).toUpperCase();
    let payload: QuotePayload | null = null;
    if (quoteId) {
      const raw = await kv().get(`agentquote:${quoteId}`);
      if (raw) payload = JSON.parse(raw) as QuotePayload;
    }
    if (!payload || payload.exp < Date.now()) {
      const recomputed = await runAgentQuote(p);
      if (!recomputed.ok || !recomputed.payload) {
        return reply(false, {
          error: "quote_missing",
          message_for_agent:
            "The quote has expired or the trip details are incomplete. Call get_quote again with the trip details, confirm the price with the caller, then call create_booking with the new quote_id.",
        });
      }
      payload = recomputed.payload;
    }

    // 2. Téléphone : celui donné par le client, sinon le numéro appelant.
    const given = cleanText(p.customer_phone, 40);
    const caller = cleanText(p.caller_id, 40);
    const phone = (given && normalizePhone(given)) || (caller && normalizePhone(caller)) || given;

    const result = await createBooking({
      payload,
      customer: {
        vehicle: cleanText(p.vehicle, 20).toLowerCase(),
        name: p.customer_name,
        phone,
        email: p.customer_email,
        flight: p.flight_number,
        signName: p.sign_name,
        notes: p.notes,
      },
      source: "phone",
      locale,
      idempotencyKey: `phone:${conversationId ?? caller ?? "anon"}:${quoteId || payload.date + payload.time}:${cleanText(p.vehicle, 20)}`,
      conversationId,
    });
    if (!result.ok) return reply(false, { error: result.error, message_for_agent: ERRORS[result.error] ?? "Booking failed." });

    const b = result.booking;
    return reply(true, {
      reference: b.ref,
      reference_spelled: spell(b.ref),
      status: "request_received_pending_dispatch_confirmation",
      price_eur: b.priceCents === null ? null : b.priceCents / 100,
      customer_phone: b.customer.phone,
      message_for_agent:
        b.priceCents === null
          ? `Quote request registered with reference ${b.ref}. Tell the caller our dispatch team will call or text them back with a price and confirmation. Do not promise a price or a driver.`
          : `Booking request registered with reference ${b.ref}. Read the reference slowly (${spell(b.ref)}). Tell the caller our dispatch team will confirm the driver by phone or text message. Do not say the driver is already confirmed.`,
    });
  } catch (err) {
    console.error("[rydar] agent create_booking", err);
    return reply(false, { error: "server_error", message_for_agent: ERRORS.dispatch_failed });
  }
}
