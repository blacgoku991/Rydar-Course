import { DRIVE_WEBHOOK_LAST_KEY, driveWebhookSecret, verifyDriveSignature, type DriveRide } from "@/lib/drive";
import { jsonError, jsonOk } from "@/lib/http";
import { kv } from "@/lib/store";
import { applyDriveRide } from "@/lib/telegram/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avis en direct de Rydar Drive (webhooks). À chaque étape d'une course (chauffeur attribué, en route, sur place,
 * client à bord, terminée, annulée, aucun chauffeur, heure modifiée…), Rydar Drive envoie ici un événement signé ;
 * la fiche admin Telegram de la course RP-… correspondante est mise à jour.
 *  - signature HMAC-SHA256 vérifiée (secret partagé, horodatage à ± 5 minutes) ;
 *  - anti-doublon sur l'id de l'avis (7 jours) : un avis renvoyé n'est traité qu'une fois ;
 *  - data.ride est l'état de la course à l'envoi : un instantané plus ancien que le dernier appliqué est ignoré ;
 *  - courses inconnues (créées directement dans Rydar Drive) : ignorées ;
 *  - 500 seulement si l'enregistrement de la course échoue (Rydar Drive renverra l'avis) ; Telegram n'y joue pas.
 */

const MAX_BYTES = 64 * 1024;
const REF_RE = /^RP-[A-Z0-9]{5}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DEDUPE_TTL = 7 * 24 * 3600;
const LAST_TTL = 30 * 24 * 3600;

interface DriveEvent {
  id: string;
  type: string;
  created_at?: string;
  data?: { ride?: DriveRide | null; status?: string | null; previous_status?: string | null } | null;
}

function isEvent(v: unknown): v is DriveEvent {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.id !== "string" || !ID_RE.test(e.id)) return false;
  if (typeof e.type !== "string" || !/^[a-z_.]{1,64}$/.test(e.type)) return false;
  return e.data === undefined || e.data === null || (typeof e.data === "object" && !Array.isArray(e.data));
}

function isRide(v: unknown): v is DriveRide {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.status === "string" && typeof r.external_reference === "string";
}

/** Corps brut, lu au plus `max` octets (null au-delà). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: Request) {
  const secret = driveWebhookSecret();
  if (!secret) return jsonError("not_configured", 503);

  const raw = await readLimited(req, MAX_BYTES).catch(() => null);
  if (raw === null) return jsonError("payload_too_large", 413);
  if (!verifyDriveSignature(raw, req.headers.get("x-rydar-timestamp"), req.headers.get("x-rydar-signature"), secret)) {
    return jsonError("invalid_signature", 401);
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonError("bad_request");
  }
  if (!isEvent(event)) return jsonError("bad_request");

  const store = kv();
  // Dernier avis reçu (affiché sur /setup) : jamais bloquant.
  await store
    .set(DRIVE_WEBHOOK_LAST_KEY, JSON.stringify({ at: new Date().toISOString(), type: event.type }), LAST_TTL)
    .catch((err) => console.error("[rydar] avis Rydar Drive : dernier avis", err));

  const dedupeKey = `drivewh:${event.id}`;
  let claimed = false;
  try {
    if (!(await store.setNX(dedupeKey, "1", DEDUPE_TTL))) return jsonOk({ duplicate: true });
    claimed = true;
  } catch (err) {
    // Stockage indisponible : traité quand même, la mise à jour de la course est idempotente.
    console.error("[rydar] avis Rydar Drive : anti-doublon", err);
  }

  if (event.type === "ping") return jsonOk({ pong: true });
  const ride = event.data?.ride;
  if (!event.type.startsWith("ride.") || !isRide(ride) || !REF_RE.test(ride.external_reference ?? "")) return jsonOk({ ignored: true });

  try {
    const res = await applyDriveRide(ride.external_reference!, ride, { event: event.type, notify: true });
    if (!res.ok && res.reason === "conflict") throw new Error("course modifiée en même temps, enregistrement impossible");
    if (!res.ok) return jsonOk({ ignored: true });
    return jsonOk({ updated: res.changed });
  } catch (err) {
    console.error("[rydar] avis Rydar Drive", event.type, err);
    // Libère l'anti-doublon : le renvoi de Rydar Drive sera traité.
    if (claimed) await store.del(dedupeKey).catch(() => undefined);
    return jsonError("store_failed", 500);
  }
}
