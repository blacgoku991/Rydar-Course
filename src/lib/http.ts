import "server-only";
import type { Locale } from "@/lib/types";

export async function readJson(req: Request, maxBytes = 20_000): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const json = JSON.parse(text);
    return json && typeof json === "object" && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

export function localeOf(v: unknown): Locale {
  return v === "en" ? "en" : "fr";
}

export function jsonError(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(data: Record<string, unknown>) {
  return Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
