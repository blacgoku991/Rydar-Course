import { isAgentRequest, toolParams } from "@/lib/agent/auth";
import { runAgentQuote } from "@/lib/agent/quote";
import { readJson } from "@/lib/http";

/** Outil "get_quote" appelé par l'assistant téléphonique. */
export async function POST(req: Request) {
  if (!isAgentRequest(req)) return new Response("forbidden", { status: 403 });
  const body = await readJson(req);
  if (!body) return Response.json({ ok: false, error: "bad_request", message_for_agent: "Invalid request." });
  try {
    const result = await runAgentQuote(toolParams(body));
    return Response.json(result.body);
  } catch (err) {
    console.error("[rydar] agent get_quote", err);
    return Response.json({
      ok: false,
      error: "server_error",
      message_for_agent:
        "Technical problem while computing the price. Apologise, take the caller's name and number, and offer a callback from our team (or transfer to a human).",
    });
  }
}
