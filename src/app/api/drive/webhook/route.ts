import { DRIVE_WEBHOOK_LAST_KEY, driveWebhookSecret, verifyDriveSignature, type DriveRide } from "@/lib/drive";
import { isRecentDriveRide } from "@/lib/drive-sync";
import { jsonError, jsonOk } from "@/lib/http";
import { kv } from "@/lib/store";
import { applyDriveRide, holdEarlyDriveRide } from "@/lib/telegram/central";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avis en direct de Rydar Drive (webhooks). À chaque étape d'une course (chauffeur attribué, en route, sur place,
 * client à bord, terminée, annulée, aucun chauffeur, heure modifiée…), Rydar Drive envoie ici un événement signé ;
 * la fiche admin Telegram de la course RP-… correspondante est mise à jour.
 *  - signature HMAC-SHA256 vérifiée (secret partagé, horodatage à ± 5 minutes), avant toute lecture ou écriture ;
 *  - anti-doublon sur l'id de l'avis : « en cours » 45 s pendant le traitement, puis « traité » 7 jours une fois la
 *    course enregistrée. Un traitement interrompu (plantage, délai dépassé) n'est donc jamais compté comme traité :
 *    le renvoi de Rydar Drive (ou « Renvoyer ») l'applique ; pendant le traitement, un doublon reçoit 409 (à réessayer) ;
 *  - data.ride est l'état de la course à l'envoi : un instantané plus ancien que le dernier appliqué est ignoré ;
 *  - course pas encore enregistrée ici mais créée il y a moins de 15 minutes dans Rydar Drive (réservation en cours) :
 *    avis gardé de côté (appliqué à l'enregistrement, s'il porte le même id de course) et 409 « not_ready » pour que
 *    Rydar Drive le renvoie ;
 *  - courses inconnues au-delà (créées directement dans Rydar Drive, autre centrale…) : ignorées ;
 *  - 500 si l'enregistrement de la course échoue (Rydar Drive renverra l'avis) ; Telegram n'y joue pas.
 */

const MAX_BYTES = 64 * 1024;
const REF_RE = /^RP-[A-Z0-9]{5}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DEDUPE_TTL = 7 * 24 * 3600;
/** Plus court que le premier délai de renvoi de Rydar Drive (60 s) : un traitement interrompu est repris au renvoi. */
const PROCESSING_TTL = 45;
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
    if (!(await store.setNX(dedupeKey, "processing", PROCESSING_TTL))) {
      const state = await store.get(dedupeKey);
      // Déjà traité : rien à refaire. Encore en cours (ou bail tout juste expiré) : Rydar Drive renverra l'avis.
      if (state !== null && state !== "processing") return jsonOk({ duplicate: true });
      return jsonError("in_progress", 409);
    }
    claimed = true;
  } catch (err) {
    // Stockage indisponible : traité quand même, la mise à jour de la course est idempotente.
    console.error("[rydar] avis Rydar Drive : anti-doublon", err);
  }
  /** Avis traité : les renvois de ce même avis sont acquittés sans être rejoués. */
  const done = async () => {
    if (claimed) await store.set(dedupeKey, "done", DEDUPE_TTL).catch((err) => console.error("[rydar] avis Rydar Drive : anti-doublon", err));
  };
  /** Avis non traité : le renvoi de Rydar Drive sera traité. */
  const release = async () => {
    if (claimed) await store.del(dedupeKey).catch(() => undefined);
  };

  if (event.type === "ping") {
    await done();
    return jsonOk({ pong: true });
  }
  const ride = event.data?.ride;
  if (!event.type.startsWith("ride.") || !isRide(ride) || !REF_RE.test(ride.external_reference ?? "")) {
    await done();
    return jsonOk({ ignored: true });
  }
  const ref = ride.external_reference!;

  try {
    const res = await applyDriveRide(ref, ride, { event: event.type, notify: true, refreshUnchanged: true });
    if (!res.ok && res.reason === "conflict") throw new Error("course modifiée en même temps, enregistrement impossible");
    if (!res.ok && res.reason === "not_found" && isRecentDriveRide(ride)) {
      // Réservation en cours : la course n'est pas encore enregistrée ici. L'avis est gardé de côté (appliqué à
      // l'enregistrement, seulement si l'id de course correspond) et Rydar Drive le renverra avec l'état du moment.
      await holdEarlyDriveRide(ref, ride).catch((err) => console.error("[rydar] avis Rydar Drive : mise de côté", err));
      await release();
      return jsonError("not_ready", 409);
    }
    await done();
    if (!res.ok) return jsonOk({ ignored: true });
    return jsonOk({ updated: res.changed });
  } catch (err) {
    console.error("[rydar] avis Rydar Drive", event.type, err);
    await release();
    return jsonError("store_failed", 500);
  }
}
