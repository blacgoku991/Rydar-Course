import "server-only";
import { timingSafeEqual } from "node:crypto";
import { derivedSecret } from "@/lib/env";

/** Secret envoyé par ElevenLabs dans l'en-tête X-Agent-Secret (configuré automatiquement par /setup). */
export function agentToolsSecret() {
  return derivedSecret("agent-tools").slice(0, 48);
}

export function isAgentRequest(req: Request) {
  let expected: string;
  try {
    expected = agentToolsSecret();
  } catch {
    return false;
  }
  const given = req.headers.get("x-agent-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ElevenLabs peut envoyer les paramètres à plat ou dans { parameters }. */
export function toolParams(body: Record<string, unknown>): Record<string, unknown> {
  const p = body.parameters;
  return p && typeof p === "object" && !Array.isArray(p) ? { ...body, ...(p as Record<string, unknown>) } : body;
}
