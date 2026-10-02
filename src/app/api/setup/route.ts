import { timingSafeEqual } from "node:crypto";
import { BUSINESS } from "@/config/business";
import { agentLanguages, ElevenLabsError, setupPhoneNumber, setupVoiceAgent } from "@/lib/agent/elevenlabs";
import { env, hasSecretBase, siteUrl } from "@/lib/env";
import { jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { rideStorageKind } from "@/lib/rides";
import { kv } from "@/lib/store";
import { sendToCentral, telegramConfigured, tg } from "@/lib/telegram/api";
import { postBookingToCentral } from "@/lib/telegram/central";
import { telegramWebhookSecret } from "@/lib/telegram/secret";
import { addDays, nowInZone } from "@/lib/time";
import type { Booking } from "@/lib/types";

/** Assistant de configuration (page /setup). Protégé par APP_SECRET. */

function authorized(key: unknown) {
  const secret = env.appSecret;
  if (!secret || typeof key !== "string") return false;
  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function status() {
  const out: Record<string, unknown> = {
    siteUrl: siteUrl(),
    appSecret: !!env.appSecret,
    secretBase: hasSecretBase(),
    store: kv().kind,
    commissionPercent: BUSINESS.commissionPercent,
    phoneDisplayed: BUSINESS.phoneDisplay || null,
    telegram: { token: !!env.telegramToken, chatId: env.telegramChatId ?? null, adminChatId: env.telegramAdminChatId ?? null },
    rides: rideStorageKind(),
    elevenlabs: {
      apiKey: !!env.elevenlabsApiKey,
      agentId: env.elevenlabsAgentId ?? null,
      voiceId: env.elevenlabsVoiceId ?? null,
      languages: agentLanguages(),
      webhookSecret: !!env.elevenlabsWebhookSecret,
    },
    twilio: { configured: !!(env.twilioAccountSid && env.twilioAuthToken && env.twilioPhoneNumber), number: env.twilioPhoneNumber ?? null },
    humanTransfer: !!env.humanTransferNumber,
  };
  if (env.telegramToken) {
    try {
      const me = await tg<{ username: string }>("getMe", {});
      const hook = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {});
      out.telegram = {
        ...(out.telegram as object),
        bot: `@${me.username}`,
        webhookUrl: hook.url || null,
        webhookOk: hook.url === `${siteUrl()}/api/telegram/webhook`,
        lastError: hook.last_error_message ?? null,
      };
    } catch (err) {
      out.telegram = { ...(out.telegram as object), error: (err as Error).message };
    }
  }
  return out;
}

async function connectTelegram() {
  if (!env.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN manquant");
  const url = `${siteUrl()}/api/telegram/webhook`;
  await tg("setWebhook", {
    url,
    secret_token: telegramWebhookSecret(),
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    max_connections: 1,
    drop_pending_updates: true,
  });
  let message = `Webhook Telegram branché sur ${url}.`;
  if (telegramConfigured()) {
    await sendToCentral({
      text: "✅ <b>Centrale RYDAR Privé connectée.</b>\nLes courses arriveront ici. Appuyez sur « ✋ JE PRENDS » pour en prendre une : les détails client vous sont envoyés en privé.",
      parse_mode: "HTML",
    });
    message += " Message de test envoyé dans le groupe.";
    if (env.telegramAdminChatId) {
      await tg("sendMessage", {
        chat_id: env.telegramAdminChatId,
        text: "✅ <b>Vous recevrez ici les fiches admin</b> (prix client, commission, chauffeur, historique). Tapez /courses pour la liste.",
        parse_mode: "HTML",
      });
    } else {
      message += " Pour les fiches admin privées : envoyez /id au bot en privé et mettez le numéro dans TELEGRAM_ADMIN_CHAT_ID.";
    }
  } else {
    message += " Ajoutez maintenant le bot à votre groupe et tapez /id pour obtenir TELEGRAM_CHAT_ID.";
  }
  return { message };
}

async function testBooking() {
  if (!telegramConfigured()) throw new Error("Telegram n'est pas encore configuré (TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID).");
  const date = addDays(nowInZone().date, 2);
  const booking: Booking = {
    ref: "RP-TEST1",
    createdAt: new Date().toISOString(),
    source: "web",
    locale: "fr",
    service: "transfer",
    pickup: { id: "test", label: "10 Place Vendôme, 75001 Paris", kind: "address", lat: 48.8675, lon: 2.3294, postcode: "75001" },
    dropoff: {
      id: "known:cdg-2e",
      label: "Aéroport Paris-Charles de Gaulle (CDG) — Terminal 2E",
      kind: "airport",
      lat: 49.0046,
      lon: 2.5839,
      postcode: "95700",
    },
    date,
    time: "09:30",
    hours: null,
    passengers: 2,
    luggage: 2,
    childSeats: 0,
    vehicle: "business",
    priceCents: 7500,
    fixed: true,
    distanceKm: 31.5,
    durationMin: 45,
    customer: { name: "Client Test", phone: "+33600000000" },
    flight: "AF1234",
    notes: "Ceci est une réservation de test : vous pouvez cliquer sur les boutons.",
  };
  await postBookingToCentral(booking, { test: true });
  return { message: "Réservation de test envoyée dans la centrale." };
}

export async function POST(req: Request) {
  if (!(await rateLimit("setup", clientIp(req), 30, 600))) return jsonError("rate_limited", 429);
  const body = await readJson(req);
  if (!body) return jsonError("bad_request");
  if (!env.appSecret) return jsonError("app_secret_missing", 503, { message: "Définissez d'abord la variable APP_SECRET puis redéployez." });
  if (!authorized(body.key)) return jsonError("unauthorized", 401, { message: "Clé incorrecte." });

  try {
    switch (body.action) {
      case "status":
        return Response.json({ ok: true, status: await status() });
      case "telegram":
        return Response.json({ ok: true, ...(await connectTelegram()) });
      case "test_booking":
        return Response.json({ ok: true, ...(await testBooking()) });
      case "agent": {
        const r = await setupVoiceAgent();
        return Response.json({
          ok: true,
          message: `Agent ${r.created ? "créé" : "mis à jour"} : ${r.agentId}.`,
          agent: r,
        });
      }
      case "phone": {
        const agent = await setupVoiceAgent();
        const phone = await setupPhoneNumber(agent.agentId);
        return Response.json({
          ok: true,
          message: `Numéro ${phone.phoneNumber} ${phone.created ? "importé" : "retrouvé"} et relié à l'agent ${agent.agentId}. Appelez-le pour tester !`,
          agent,
          phone,
        });
      }
      default:
        return jsonError("unknown_action");
    }
  } catch (err) {
    const message = err instanceof ElevenLabsError || err instanceof Error ? err.message : String(err);
    console.error("[rydar] setup", message);
    return jsonError("failed", 500, { message });
  }
}
