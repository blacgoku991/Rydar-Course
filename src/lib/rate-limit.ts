import "server-only";
import { kv } from "@/lib/store";

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Fenêtre fixe simple. Retourne false si la limite est dépassée. */
export async function rateLimit(bucket: string, id: string, limit: number, windowSec: number) {
  try {
    const n = await kv().incr(`rl:${bucket}:${id}`, windowSec);
    return n <= limit;
  } catch (err) {
    console.error("[rydar] rate limit indisponible", err);
    return true;
  }
}
