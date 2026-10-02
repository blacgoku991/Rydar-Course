import { ConfigError } from "@/lib/env";
import { jsonError, jsonOk, localeOf, readJson } from "@/lib/http";
import { buildQuote, parseQuoteInput } from "@/lib/quote-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!(await rateLimit("quote", clientIp(req), 40, 600))) return jsonError("rate_limited", 429);
  const body = await readJson(req);
  if (!body) return jsonError("bad_request");
  const locale = localeOf(body.locale);
  const parsed = parseQuoteInput(body, locale);
  if (!parsed.ok) return jsonError(parsed.error);
  try {
    const result = await buildQuote(parsed.input);
    if (!result.ok) return jsonError(result.error);
    return jsonOk({ quote: result.quote });
  } catch (err) {
    console.error("[rydar] devis", err);
    return jsonError(err instanceof ConfigError ? "not_configured" : "server_error", 500);
  }
}
