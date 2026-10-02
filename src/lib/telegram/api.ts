import "server-only";
import { env } from "@/lib/env";

export class TelegramError extends Error {
  constructor(
    message: string,
    public code?: number,
    public migrateToChatId?: number,
  ) {
    super(message);
  }
}

export function telegramConfigured() {
  return !!(env.telegramToken && env.telegramChatId);
}

export async function tg<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = env.telegramToken;
  if (!token) throw new TelegramError("TELEGRAM_BOT_TOKEN manquant");
  const base = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");
  const res = await fetch(`${base}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: { migrate_to_chat_id?: number };
  };
  if (!json.ok) {
    throw new TelegramError(json.description ?? `HTTP ${res.status}`, json.error_code, json.parameters?.migrate_to_chat_id);
  }
  return json.result as T;
}

/** Envoie dans le groupe centrale ; suit automatiquement une migration groupe → supergroupe. */
export async function sendToCentral<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const chatId = env.telegramChatId;
  if (!chatId) throw new TelegramError("TELEGRAM_CHAT_ID manquant");
  const base = { ...payload, chat_id: chatId, ...(env.telegramThreadId ? { message_thread_id: env.telegramThreadId } : {}) };
  try {
    return await tg<T>("sendMessage", base);
  } catch (err) {
    if (err instanceof TelegramError && err.migrateToChatId) {
      console.error(`[rydar] Le groupe Telegram est devenu un supergroupe : mettez TELEGRAM_CHAT_ID=${err.migrateToChatId}`);
      return await tg<T>("sendMessage", { ...base, chat_id: err.migrateToChatId });
    }
    throw err;
  }
}
