import { timingSafeEqual } from "node:crypto";
import { handleTelegramUpdate } from "@/lib/telegram/central";
import { telegramWebhookSecret } from "@/lib/telegram/secret";
import type { TgUpdate } from "@/lib/telegram/types";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  let expected: string;
  try {
    expected = telegramWebhookSecret();
  } catch {
    return new Response("not configured", { status: 503 });
  }
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(given, expected)) return new Response("forbidden", { status: 403 });

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    // On répond 200 quand même : sinon Telegram renvoie la même mise à jour en boucle.
    console.error("[rydar] webhook Telegram", err);
  }
  return Response.json({ ok: true });
}
