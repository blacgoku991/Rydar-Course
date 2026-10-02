import { driveConfigured } from "@/lib/drive";
import { telegramConfigured } from "@/lib/telegram/api";

export function GET() {
  const booking = driveConfigured() ? "rydar_drive" : telegramConfigured() ? "telegram" : "not_configured";
  return Response.json({ ok: true, booking }, { headers: { "Cache-Control": "no-store" } });
}
