import "server-only";
import { derivedSecret } from "@/lib/env";

/** Jeton vérifié sur chaque appel du webhook Telegram (en-tête X-Telegram-Bot-Api-Secret-Token). */
export function telegramWebhookSecret() {
  return derivedSecret("telegram-webhook").slice(0, 64);
}
