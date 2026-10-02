import { isAgentRequest } from "@/lib/agent/auth";
import { verifyElevenLabsSignature } from "@/lib/agent/webhook";
import { env } from "@/lib/env";
import { formatPhoneIntl } from "@/lib/phone";
import { kv } from "@/lib/store";
import { telegramConfigured } from "@/lib/telegram/api";
import { notifyCentral } from "@/lib/telegram/central";
import { escapeHtml } from "@/lib/telegram/entities";

/**
 * Webhook "post-call" d'ElevenLabs : après chaque appel, un récapitulatif part
 * dans la centrale Telegram (avec alerte si aucune réservation n'a été créée).
 */

interface PostCallPayload {
  type?: string;
  data?: {
    conversation_id?: string;
    status?: string;
    metadata?: {
      call_duration_secs?: number;
      main_language?: string;
      termination_reason?: string;
      phone_call?: { external_number?: string; direction?: string };
    };
    analysis?: {
      transcript_summary?: string;
      call_successful?: string;
      data_collection_results?: Record<string, { value?: unknown }>;
    };
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
  };
}

function duration(secs?: number) {
  if (!secs || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = env.elevenlabsWebhookSecret;
  const signed = secret ? verifyElevenLabsSignature(raw, req.headers.get("elevenlabs-signature"), secret) : false;
  if (!signed && !isAgentRequest(req)) return new Response("forbidden", { status: 403 });

  let payload: PostCallPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (payload.type !== "post_call_transcription" || !payload.data) return Response.json({ ok: true, ignored: true });

  const d = payload.data;
  const secs = d.metadata?.call_duration_secs ?? 0;
  if (secs < 4) return Response.json({ ok: true, ignored: "too_short" });

  const conv = d.conversation_id ?? "";
  if (
    conv &&
    !(await kv()
      .setNX(`postcall:${conv}`, "1", 86400)
      .catch(() => true))
  )
    return Response.json({ ok: true, duplicate: true });

  const ref = conv
    ? await kv()
        .get(`conv:${conv}`)
        .catch(() => null)
    : null;
  const collected = d.analysis?.data_collection_results?.booking_reference?.value;
  const bookingRef = ref ?? (typeof collected === "string" && /^RP-[A-Z0-9]{5}$/.test(collected) ? collected : null);
  const callerRaw =
    d.metadata?.phone_call?.external_number ?? (d.conversation_initiation_client_data?.dynamic_variables?.system__caller_id as string | undefined);
  const caller = callerRaw ? formatPhoneIntl(callerRaw) : "numéro masqué";
  const summary = d.analysis?.transcript_summary?.trim();
  const lang = d.metadata?.main_language?.toUpperCase();

  const lines = [
    `📞 <b>Appel assistant IA terminé</b> · ${duration(secs)}${lang ? ` · ${escapeHtml(lang)}` : ""}`,
    `De : ${escapeHtml(caller)}`,
    bookingRef ? `✅ Réservation créée : <code>${escapeHtml(bookingRef)}</code>` : "⚠️ <b>Aucune réservation enregistrée</b> — à rappeler si besoin",
  ];
  if (summary) lines.push("", `<i>${escapeHtml(summary.slice(0, 1500))}</i>`);
  if (conv) lines.push("", `<code>${escapeHtml(conv)}</code>`);

  if (telegramConfigured()) {
    try {
      await notifyCentral(lines.join("\n"));
    } catch (err) {
      console.error("[rydar] récap d'appel Telegram", err);
    }
  }
  return Response.json({ ok: true });
}
