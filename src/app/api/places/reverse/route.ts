import { reverseGeocode } from "@/lib/geocoder";
import { isValidCoord } from "@/lib/geo";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!isValidCoord(lat, lon)) return Response.json({ place: null }, { status: 400 });
  if (!(await rateLimit("reverse", clientIp(req), 30, 60))) return Response.json({ place: null }, { status: 429 });
  const place = await reverseGeocode(lat, lon);
  return Response.json({ place }, { headers: { "Cache-Control": "no-store" } });
}
