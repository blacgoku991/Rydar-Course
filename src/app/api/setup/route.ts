import { timingSafeEqual } from "node:crypto";
import { BUSINESS } from "@/config/business";
import { agentLanguages, ElevenLabsError, setupPhoneNumber, setupVoiceAgent } from "@/lib/agent/elevenlabs";
import {
  DRIVE_WEBHOOK_LAST_KEY,
  driveConfigured,
  DriveError,
  driveWebhookSecret,
  driveWebhookUrl,
  listDriveWebhooks,
  pingDrive,
  registerDriveWebhook,
  testDriveWebhook,
} from "@/lib/drive";
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
    drive: { configured: driveConfigured(), url: process.env.RYDAR_DRIVE_URL?.trim() || null, webhook: await driveWebhookStatus() },
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

/** Suivi en direct (avis Rydar Drive) : secret disponible, inscription chez Rydar Drive, dernier avis reçu. */
async function driveWebhookStatus() {
  const url = driveWebhookUrl(siteUrl());
  let lastReceived: { at: string; type: string } | null = null;
  try {
    const raw = await kv().get(DRIVE_WEBHOOK_LAST_KEY);
    lastReceived = raw ? (JSON.parse(raw) as { at: string; type: string }) : null;
  } catch {
    /* stockage indisponible */
  }
  const out: Record<string, unknown> = {
    url,
    secret: !!driveWebhookSecret(),
    explicitSecret: !!process.env.RYDAR_DRIVE_WEBHOOK_SECRET?.trim(),
    lastReceived,
    registered: null,
  };
  if (driveConfigured()) {
    try {
      const hook = (await listDriveWebhooks()).find((h) => h.url === url);
      out.registered = hook
        ? { enabled: hook.enabled, disabledReason: hook.disabled_reason, lastError: hook.last_error, lastSuccessAt: hook.last_success_at }
        : false;
    } catch (err) {
      out.error = driveWebhookError(err);
    }
  }
  return out;
}

/** Message clair pour les refus de Rydar Drive liés aux avis en direct. */
function driveWebhookError(err: unknown) {
  if (err instanceof DriveError) {
    if (err.code === "INSUFFICIENT_SCOPE")
      return "La clé API Rydar Drive n'a pas la permission « Webhooks » (webhooks:manage). Dans Rydar Drive → Intégrations → Clés API, créez une clé avec rides:create, rides:read, rides:cancel et webhooks:manage, remplacez RYDAR_DRIVE_API_KEY dans Vercel puis redéployez.";
    if (err.status === 404 || err.status === 405) return "Cette version de Rydar Drive ne propose pas encore les webhooks : mettez Rydar Drive à jour.";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

async function connectDriveWebhook() {
  if (!driveConfigured()) throw new Error("RYDAR_DRIVE_URL et RYDAR_DRIVE_API_KEY sont requis");
  if (!driveWebhookSecret()) throw new Error("Définissez APP_SECRET (ou RYDAR_DRIVE_WEBHOOK_SECRET) dans Vercel puis redéployez.");
  const site = siteUrl();
  if (!site.startsWith("https://")) throw new Error(`L'adresse du site doit être en https (actuellement ${site}) : renseignez NEXT_PUBLIC_SITE_URL.`);
  let id: string | undefined;
  try {
    id = (await registerDriveWebhook(site)).endpoint?.id;
  } catch (err) {
    throw new Error(driveWebhookError(err));
  }
  // Avis de test : « Dernier avis reçu » se met à jour quelques secondes plus tard.
  let ping = false;
  if (id)
    ping = await testDriveWebhook(id).then(
      () => true,
      () => false,
    );
  return {
    message: `Suivi en direct activé : Rydar Drive préviendra le site à chaque étape (chauffeur attribué, en route, sur place, terminée, annulée, aucun chauffeur…) et la fiche admin Telegram se mettra à jour toute seule.${ping ? " Un avis de test vient d'être envoyé : cliquez sur « Vérifier » dans quelques secondes." : ""}`,
  };
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
      case "drive": {
        if (!driveConfigured()) throw new Error("RYDAR_DRIVE_URL et RYDAR_DRIVE_API_KEY sont requis");
        const r = await pingDrive();
        const scopes = r.scopes ?? [];
        const missing = ["rides:create", "rides:read", "rides:cancel", "webhooks:manage"].filter((s) => !scopes.includes(s));
        return Response.json({
          ok: true,
          message: `Rydar Drive connecté. Permissions : ${scopes.join(", ") || "?"}.${missing.length ? ` Manquant (conseillé) : ${missing.join(", ")}.` : ""} Les nouvelles réservations y sont envoyées.`,
        });
      }
      case "drive_webhook":
        return Response.json({ ok: true, ...(await connectDriveWebhook()) });
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
