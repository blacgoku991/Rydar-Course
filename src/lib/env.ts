import "server-only";
import { createHmac } from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

function clean(v: string | undefined) {
  const t = v?.trim();
  return t ? t : undefined;
}

export function siteUrl() {
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) || clean(process.env.VERCEL_URL);
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const env = {
  isProd,
  get appSecret() {
    return clean(process.env.APP_SECRET);
  },
  get telegramToken() {
    return clean(process.env.TELEGRAM_BOT_TOKEN);
  },
  get telegramChatId() {
    return clean(process.env.TELEGRAM_CHAT_ID);
  },
  /** Optionnel : sujet (topic) d'un groupe forum Telegram. */
  get telegramThreadId() {
    const v = clean(process.env.TELEGRAM_THREAD_ID);
    return v && /^\d+$/.test(v) ? Number(v) : undefined;
  },
  /** Optionnel : identifiants Telegram (séparés par des virgules) autorisés à annuler/libérer comme un admin. */
  get telegramAdminIds() {
    return (clean(process.env.TELEGRAM_ADMIN_IDS) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get elevenlabsApiKey() {
    return clean(process.env.ELEVENLABS_API_KEY);
  },
  get elevenlabsAgentId() {
    return clean(process.env.ELEVENLABS_AGENT_ID);
  },
  get elevenlabsVoiceId() {
    return clean(process.env.ELEVENLABS_VOICE_ID);
  },
  get elevenlabsWebhookSecret() {
    return clean(process.env.ELEVENLABS_WEBHOOK_SECRET);
  },
  get twilioAccountSid() {
    return clean(process.env.TWILIO_ACCOUNT_SID);
  },
  get twilioAuthToken() {
    return clean(process.env.TWILIO_AUTH_TOKEN);
  },
  get twilioPhoneNumber() {
    return clean(process.env.TWILIO_PHONE_NUMBER);
  },
  /** Numéro vers lequel l'IA transfère l'appel si le client veut parler à un humain. */
  get humanTransferNumber() {
    return clean(process.env.HUMAN_TRANSFER_NUMBER);
  },
  get upstashUrl() {
    return clean(process.env.UPSTASH_REDIS_REST_URL) || clean(process.env.KV_REST_API_URL);
  },
  get upstashToken() {
    return clean(process.env.UPSTASH_REDIS_REST_TOKEN) || clean(process.env.KV_REST_API_TOKEN);
  },
};

let warned = false;

/** Base des secrets dérivés. APP_SECRET est recommandé ; à défaut on dérive du token Telegram. */
function secretBase(): string | null {
  const base = env.appSecret || env.telegramToken;
  if (base) return base;
  if (!isProd) {
    if (!warned) {
      warned = true;
      console.warn("[rydar] APP_SECRET manquant : secret de développement utilisé (ne jamais faire ça en production).");
    }
    return "dev-only-insecure-secret";
  }
  return null;
}

export class ConfigError extends Error {}

/** Secret dérivé stable pour un usage donné (signature des devis, webhook Telegram…). */
export function derivedSecret(purpose: string): string {
  const base = secretBase();
  if (!base) throw new ConfigError("APP_SECRET n'est pas configuré.");
  return createHmac("sha256", base).update(`rydar:${purpose}`).digest("hex");
}

export function hasSecretBase() {
  return !!(env.appSecret || env.telegramToken);
}
