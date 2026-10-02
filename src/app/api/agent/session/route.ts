import { conversationToken, ElevenLabsError, findAgentId } from "@/lib/agent/elevenlabs";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Ouvre une conversation avec l'assistant vocal depuis le site.
 * Renvoie un jeton WebRTC à usage unique (la clé ElevenLabs reste côté serveur),
 * ou à défaut l'identifiant de l'agent public.
 */
export async function GET(req: Request) {
  // Réservé aux pages du site (les navigateurs envoient Sec-Fetch-Site).
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return jsonError("forbidden", 403);

  const ip = clientIp(req);
  if (!(await rateLimit("voice", ip, 6, 600))) return jsonError("rate_limited", 429);

  const agentId = env.elevenlabsApiKey ? await findAgentId() : env.elevenlabsAgentId;
  if (!agentId) return jsonError("unavailable", 503);

  if (!env.elevenlabsApiKey) return jsonOk({ agentId });
  try {
    return jsonOk({ token: await conversationToken(agentId) });
  } catch (err) {
    console.error("[rydar] jeton assistant vocal", err instanceof ElevenLabsError ? err.message : err);
    return jsonError("unavailable", 502);
  }
}
