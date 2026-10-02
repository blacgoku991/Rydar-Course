import { telegramConfigured } from "@/lib/telegram/api";

export function GET() {
  return Response.json({ ok: true, booking: telegramConfigured() ? "telegram" : "not_configured" }, { headers: { "Cache-Control": "no-store" } });
}
