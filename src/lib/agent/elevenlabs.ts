import "server-only";
import { agentToolsSecret } from "@/lib/agent/auth";
import { buildSystemPrompt, FIRST_MESSAGES } from "@/lib/agent/prompt";
import { env, siteUrl } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";

/**
 * Configuration automatique de l'assistant téléphonique via l'API ElevenLabs :
 * outils (webhooks), webhook post-appel, agent, et numéro Twilio.
 * Appelée depuis la page /setup. Ré-exécutable sans créer de doublons.
 */

/** ELEVENLABS_API_BASE permet d'utiliser l'hébergement européen (ex. https://api.eu.residency.elevenlabs.io). */
const API = (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/+$/, "");
export const AGENT_NAME = "RYDAR Privé — Assistant téléphonique";

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function el<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = env.elevenlabsApiKey;
  if (!key) throw new ElevenLabsError("ELEVENLABS_API_KEY manquant");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non JSON */
  }
  if (!res.ok) {
    const detail = (json as { detail?: unknown } | null)?.detail;
    const msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : text.slice(0, 300);
    throw new ElevenLabsError(`ElevenLabs ${init.method ?? "GET"} ${path} → ${res.status} ${msg}`, res.status);
  }
  return json as T;
}

export function agentLanguages(): string[] {
  const extra = (process.env.AGENT_LANGUAGES ?? "fr,en")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((l) => l in FIRST_MESSAGES);
  return Array.from(new Set(["fr", ...extra]));
}

export function callRetentionDays() {
  const n = Number(process.env.CALL_RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 && n <= 730 ? n : 90;
}

function llm() {
  // Modèle rapide par défaut : au téléphone, la latence compte plus que tout.
  return process.env.ELEVENLABS_LLM?.trim() || "claude-haiku-4-5";
}

type Prop = Record<string, unknown>;
const str = (description: string, extra: Prop = {}): Prop => ({ type: "string", description, ...extra });
const int = (description: string): Prop => ({ type: "integer", description });

const tripProps: Record<string, Prop> = {
  service_type: str("'transfer' for a ride from A to B, 'hourly' for a chauffeur at disposal for several hours.", { enum: ["transfer", "hourly"] }),
  pickup_address: str("Pickup address as given by the caller: street number, street, city; or airport and terminal, train station, hotel name and city."),
  dropoff_address: str("Destination address (required for transfers), same format as the pickup."),
  date: str("Pickup date: YYYY-MM-DD, or the caller's words such as 'demain', 'tomorrow', 'vendredi', '5 octobre'."),
  time: str("Pickup time, 24-hour format HH:MM, Paris local time."),
  passengers: int("Number of passengers."),
  luggage: int("Number of suitcases (0 if none)."),
  hours: { type: "number", description: "Hourly service only: number of hours (2 to 12)." },
  child_seats: int("Number of child seats needed (0 if none)."),
};

const languageProp = str("Conversation language: 'fr' for French, 'en' for any other language.", { enum: ["fr", "en"] });

function toolConfigs(secret: string) {
  const base = siteUrl();
  const headers = { "X-Agent-Secret": secret };
  return [
    {
      type: "webhook",
      name: "get_quote",
      description:
        "Computes the price of a trip for each vehicle class and checks the addresses. Call it once you know the pickup, the destination (transfers), the date, the time, the number of passengers and suitcases.",
      response_timeout_secs: 25,
      api_schema: {
        url: `${base}/api/agent/quote`,
        method: "POST",
        content_type: "application/json",
        request_headers: headers,
        request_body_schema: {
          type: "object",
          required: ["service_type", "pickup_address", "date", "time", "passengers", "luggage", "language"],
          properties: { ...tripProps, language: languageProp },
        },
      },
    },
    {
      type: "webhook",
      name: "create_booking",
      description:
        "Registers the booking request and sends it to the dispatch team. Call it ONLY after the caller has explicitly confirmed the recap (trip, class, price, name).",
      response_timeout_secs: 25,
      api_schema: {
        url: `${base}/api/agent/booking`,
        method: "POST",
        content_type: "application/json",
        request_headers: headers,
        request_body_schema: {
          type: "object",
          required: ["quote_id", "vehicle", "customer_name", "language"],
          properties: {
            quote_id: str("The quote_id returned by get_quote."),
            vehicle: str("Vehicle class chosen by the caller.", { enum: ["business", "van", "prestige"] }),
            customer_name: str("Caller's full name."),
            customer_phone: str(
              "Phone number to reach the caller, international format if not French. Leave empty if they can be reached on the number they are calling from.",
            ),
            customer_email: str("Caller's email address, only if they give one."),
            flight_number: str("Flight or train number for airport or station pickups."),
            sign_name: str("Name to display on the welcome sign, if requested."),
            notes: str("Special requests (extra stop, accessibility, etc.)."),
            ...tripProps,
            language: languageProp,
            caller_id: { type: "string", dynamic_variable: "system__caller_id" },
            conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
          },
        },
      },
    },
  ];
}

async function upsertTool(config: Record<string, unknown>): Promise<string> {
  const name = String(config.name);
  try {
    const list = await el<{ tools?: { id: string; tool_config?: { name?: string } }[] }>(`/v1/convai/tools?search=${encodeURIComponent(name)}&page_size=100`);
    const existing = list.tools?.find((t) => t.tool_config?.name === name);
    if (existing) {
      await el(`/v1/convai/tools/${existing.id}`, { method: "PATCH", body: { tool_config: config } });
      return existing.id;
    }
  } catch (err) {
    if (err instanceof ElevenLabsError && err.status && err.status !== 404) console.warn("[rydar] liste des outils ElevenLabs", err.message);
  }
  const created = await el<{ id: string }>("/v1/convai/tools", { method: "POST", body: { tool_config: config } });
  return created.id;
}

async function ensurePostCallWebhook(secret: string): Promise<{ id: string | null; secret?: string; warning?: string }> {
  const url = `${siteUrl()}/api/agent/post-call`;
  try {
    const list = await el<{ webhooks?: { webhook_id: string; webhook_url?: string }[] }>("/v1/workspace/webhooks");
    const existing = list.webhooks?.find((w) => w.webhook_url === url);
    if (existing) return { id: existing.webhook_id };
    const created = await el<{ webhook_id: string; webhook_secret?: string }>("/v1/workspace/webhooks", {
      method: "POST",
      body: { settings: { auth_type: "hmac", name: "RYDAR post-call", webhook_url: url, request_headers: { "X-Agent-Secret": secret } } },
    });
    return { id: created.webhook_id, secret: created.webhook_secret };
  } catch (err) {
    return { id: null, warning: `Webhook post-appel non configuré : ${(err as Error).message}` };
  }
}

function agentBody(toolIds: string[], postCallWebhookId: string | null) {
  const transfer = env.humanTransferNumber ? normalizePhone(env.humanTransferNumber) : null;
  const languages = agentLanguages();
  const builtIn: Record<string, unknown> = {
    end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
  };
  if (languages.length > 1) {
    builtIn.language_detection = { type: "system", name: "language_detection", description: "", params: { system_tool_type: "language_detection" } };
  }
  if (transfer) {
    builtIn.transfer_to_number = {
      type: "system",
      name: "transfer_to_number",
      description: "",
      params: {
        system_tool_type: "transfer_to_number",
        transfers: [
          {
            transfer_destination: { type: "phone", phone_number: transfer },
            condition: "The caller asks to speak to a human, is upset, or needs something outside the booking scope (urgent ride, complaint, lost item).",
          },
        ],
      },
    };
  }

  const presets: Record<string, unknown> = {};
  for (const lang of languages) {
    if (lang === "fr") continue;
    presets[lang] = { overrides: { agent: { first_message: FIRST_MESSAGES[lang], language: lang } } };
  }

  const tts: Record<string, unknown> = { model_id: "eleven_flash_v2_5" };
  if (env.elevenlabsVoiceId) tts.voice_id = env.elevenlabsVoiceId;

  const platform: Record<string, unknown> = {
    // Durée de conservation des enregistrements/transcriptions (cohérente avec la page Confidentialité).
    privacy: { record_voice: true, retention_days: callRetentionDays() },
    data_collection: {
      booking_reference: {
        type: "string",
        description: "The booking reference returned by create_booking (format RP-XXXXX), or empty if no booking was made.",
      },
      caller_request: {
        type: "string",
        description: "One sentence describing what the caller wanted, especially if no booking was made (modification, cancellation, question).",
      },
    },
  };
  if (postCallWebhookId) platform.workspace_overrides = { webhooks: { post_call_webhook_id: postCallWebhookId, events: ["transcript"] } };

  return {
    name: AGENT_NAME,
    tags: ["rydar"],
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGES.fr,
        language: "fr",
        prompt: {
          prompt: buildSystemPrompt({ canTransfer: !!transfer }),
          llm: llm(),
          temperature: 0.3,
          timezone: "Europe/Paris",
          tool_ids: toolIds,
          built_in_tools: builtIn,
        },
      },
      tts,
      ...(Object.keys(presets).length ? { language_presets: presets } : {}),
    },
    platform_settings: platform,
  };
}

async function findAgentId(): Promise<string | null> {
  if (env.elevenlabsAgentId) return env.elevenlabsAgentId;
  try {
    const list = await el<{ agents?: { agent_id: string; name?: string }[] }>(`/v1/convai/agents?search=${encodeURIComponent("RYDAR")}&page_size=100`);
    return list.agents?.find((a) => a.name === AGENT_NAME)?.agent_id ?? null;
  } catch {
    return null;
  }
}

export interface AgentSetupResult {
  agentId: string;
  created: boolean;
  toolIds: string[];
  postCallWebhookId: string | null;
  webhookSecret?: string;
  warnings: string[];
}

export async function setupVoiceAgent(): Promise<AgentSetupResult> {
  const secret = agentToolsSecret();
  const warnings: string[] = [];
  if (siteUrl().startsWith("http://localhost"))
    warnings.push("NEXT_PUBLIC_SITE_URL pointe vers localhost : ElevenLabs ne pourra pas joindre vos outils. Lancez la configuration depuis le site en ligne.");

  const toolIds: string[] = [];
  for (const cfg of toolConfigs(secret)) toolIds.push(await upsertTool(cfg));

  const hook = await ensurePostCallWebhook(secret);
  if (hook.warning) warnings.push(hook.warning);

  const body = agentBody(toolIds, hook.id);
  let agentId = await findAgentId();
  let created = false;
  if (agentId) {
    await el(`/v1/convai/agents/${agentId}`, { method: "PATCH", body });
  } else {
    const res = await el<{ agent_id: string }>("/v1/convai/agents/create", { method: "POST", body });
    agentId = res.agent_id;
    created = true;
  }
  return { agentId, created, toolIds, postCallWebhookId: hook.id, webhookSecret: hook.secret, warnings };
}

/** Importe le numéro Twilio dans ElevenLabs (ou le retrouve) et lui assigne l'agent. */
export async function setupPhoneNumber(agentId: string): Promise<{ phoneNumberId: string; phoneNumber: string; created: boolean }> {
  const sid = env.twilioAccountSid;
  const token = env.twilioAuthToken;
  const raw = env.twilioPhoneNumber;
  if (!sid || !token || !raw) throw new ElevenLabsError("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER sont requis");
  const phoneNumber = normalizePhone(raw) ?? raw;

  let existingId: string | null = null;
  try {
    const list = await el<{ phone_number: string; phone_number_id: string }[] | { phone_numbers?: { phone_number: string; phone_number_id: string }[] }>(
      "/v1/convai/phone-numbers",
    );
    const items = Array.isArray(list) ? list : (list.phone_numbers ?? []);
    existingId = items.find((n) => normalizePhone(n.phone_number) === phoneNumber)?.phone_number_id ?? null;
  } catch {
    /* on tente la création */
  }

  let created = false;
  if (!existingId) {
    const res = await el<{ phone_number_id: string }>("/v1/convai/phone-numbers", {
      method: "POST",
      body: { provider: "twilio", phone_number: phoneNumber, label: "RYDAR Privé", sid, token },
    });
    existingId = res.phone_number_id;
    created = true;
  }
  await el(`/v1/convai/phone-numbers/${existingId}`, { method: "PATCH", body: { agent_id: agentId } });
  return { phoneNumberId: existingId, phoneNumber, created };
}
