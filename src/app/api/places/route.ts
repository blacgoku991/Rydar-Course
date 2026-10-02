import { suggestPlaces } from "@/lib/geocoder";
import { localeOf } from "@/lib/http";
import { popularPlaces } from "@/lib/known-places";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = localeOf(url.searchParams.get("locale"));
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) {
    return Response.json({ places: popularPlaces(locale) }, { headers: { "Cache-Control": "public, max-age=3600" } });
  }
  if (!(await rateLimit("places", clientIp(req), 120, 60))) {
    return Response.json({ places: [], error: "rate_limited" }, { status: 429 });
  }
  const places = await suggestPlaces(q, locale);
  return Response.json({ places }, { headers: { "Cache-Control": "public, max-age=300" } });
}
