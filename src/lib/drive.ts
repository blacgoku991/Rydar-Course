import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VehicleId } from "@/config/pricing";
import { getKnownPlace } from "@/lib/known-places";
import type { Booking, Place } from "@/lib/types";

/**
 * Rydar Drive (logiciel de dispatch) : les réservations y sont envoyées par l'API publique v1
 * (POST /rides). Rydar Drive attribue le chauffeur ; Telegram ne sert plus qu'à la fiche admin.
 * Si Rydar Drive ne répond pas, la course part dans le groupe Telegram (rien n'est perdu).
 */

export const DRIVE_CATEGORY: Record<VehicleId, "business" | "van" | "first"> = { business: "business", van: "van", prestige: "first" };

export const DRIVE_STATUS_FR: Record<string, string> = {
  CREATED: "🆕 Créée",
  SEARCHING_DRIVER: "🔎 Recherche chauffeur",
  OFFERED: "📣 Proposée aux chauffeurs",
  ACCEPTED: "🟢 Chauffeur attribué",
  DRIVER_EN_ROUTE: "🚘 Chauffeur en route",
  DRIVER_ARRIVED: "📍 Chauffeur sur place",
  PASSENGER_ONBOARD: "🧳 Client à bord",
  IN_PROGRESS: "🛣 En course",
  COMPLETED: "🏁 Terminée",
  CANCELLED: "❌ Annulée",
  NO_DRIVER_FOUND: "⚠️ Aucun chauffeur trouvé",
};

/**
 * Statuts définitifs côté Rydar Drive. NO_DRIVER_FOUND n'en fait pas partie : la centrale peut encore
 * relancer la recherche ou annuler la course.
 */
export const DRIVE_FINAL = new Set(["COMPLETED", "CANCELLED"]);

export interface DriveRide {
  id: string;
  number?: number;
  status: string;
  driver?: { first_name?: string; vehicle?: { model?: string; color?: string; plate?: string } | null } | null;
  external_reference?: string | null;
  pickup_at?: string | null;
  /** Présent dans les avis (webhooks) : sert à écarter un instantané plus ancien que celui déjà appliqué. */
  updated_at?: string | null;
  /** created_at : date de création de la course dans Rydar Drive (avis arrivé avant l'enregistrement local). */
  timestamps?: { created_at?: string | null } | null;
}

export class DriveError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

function clean(v: string | undefined) {
  const t = v?.trim();
  return t ? t : undefined;
}

/** RYDAR_DRIVE_URL : adresse de l'app (ex. https://app.rydar.app), avec ou sans /api/v1. */
function apiBase() {
  const url = clean(process.env.RYDAR_DRIVE_URL);
  if (!url) return null;
  const base = url.replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

export function driveConfigured() {
  return !!apiBase() && !!clean(process.env.RYDAR_DRIVE_API_KEY);
}

/** Lien vers la course dans le dashboard Rydar Drive. */
export function driveDashboardUrl(id: string) {
  const base = apiBase();
  return base ? `${base.replace(/\/api\/v1$/, "")}/dashboard/rides/${encodeURIComponent(id)}` : null;
}

function address(p: Place) {
  const name = p.id.startsWith("known:") ? (getKnownPlace(p.id.slice(6))?.name.fr ?? p.label) : p.label;
  const withCity = p.city && !name.toLowerCase().includes(p.city.toLowerCase()) ? `${name}, ${p.postcode ? `${p.postcode} ` : ""}${p.city}` : name;
  return withCity.slice(0, 300);
}

const point = (p: Place) => ({ address: address(p), lat: p.lat, lng: p.lon });

/** Même règle que Rydar Drive (sinon la course entière serait refusée en 422). */
const FLIGHT_RE = /^[A-Z0-9]{2,3}\s?\d{1,5}[A-Z]?$/;
const driveFlight = (f?: string) => {
  const v = f?.trim().toUpperCase();
  return v && FLIGHT_RE.test(v) ? v : undefined;
};

const SOURCE_FR: Record<Booking["source"], string> = { web: "site", phone: "téléphone IA", voice: "assistant vocal du site" };

/** Corps de POST /rides (schéma strict côté Rydar Drive : aucun champ inconnu). */
export function drivePayload(b: Booking) {
  const comment = [`RYDAR Privé ${b.ref} · réservation ${SOURCE_FR[b.source]}`];
  if (b.service === "hourly") comment.push(`Mise à disposition ${b.hours} h${b.dropoff ? "" : " (fin de prestation libre)"}`);
  if (b.priceCents === null) comment.push("Prix sur devis : à fixer avec le client");
  if (b.childSeats > 0) comment.push(`Siège(s) enfant : ${b.childSeats}`);
  if (b.signName) comment.push(`Pancarte : « ${b.signName} »`);
  const flight = driveFlight(b.flight);
  if (b.flight && !flight) comment.push(`Vol / train : ${b.flight}`);
  if (b.notes) comment.push(`Note client : ${b.notes}`);

  return {
    pickup: point(b.pickup),
    // Mise à disposition sans destination : fin de prestation au point de départ.
    dropoff: point(b.dropoff ?? b.pickup),
    date: b.date,
    time: b.time,
    customer: { name: b.customer.name, phone: b.customer.phone, ...(b.customer.email ? { email: b.customer.email } : {}) },
    passengers: Math.min(20, Math.max(1, b.passengers)),
    luggage: Math.min(30, Math.max(0, b.luggage)),
    vehicle_category: DRIVE_CATEGORY[b.vehicle],
    ...(b.priceCents !== null ? { price_cents: b.priceCents } : {}),
    ...(flight ? { flight_number: flight } : {}),
    comment: comment.join("\n").slice(0, 2000),
    external_reference: b.ref,
  };
}

async function request(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<Record<string, unknown> | null> {
  const base = apiBase();
  const key = clean(process.env.RYDAR_DRIVE_API_KEY);
  if (!base || !key) throw new DriveError("Rydar Drive non configuré", 0, "NOT_CONFIGURED");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new DriveError(`Rydar Drive injoignable : ${(err as Error).message}`, 0, "NETWORK");
  }
  const json = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: { code?: string; message?: string; details?: unknown } }) | null;
  if (!res.ok) {
    const e = json?.error;
    const details = e?.details ? ` ${JSON.stringify(e.details).slice(0, 200)}` : "";
    throw new DriveError(`${e?.message ?? `HTTP ${res.status}`}${details}`, res.status, e?.code ?? `HTTP_${res.status}`);
  }
  return json;
}

async function call<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const json = await request(path, init);
  return (json?.data ?? json) as T;
}

/**
 * Clé d'idempotence de POST /rides : unique par réservation (référence + instant de création), car Rydar Drive la
 * garde pour toujours alors qu'une référence RP-… finit par être tirée de nouveau. Stable pour une même réservation :
 * un renvoi de cette réservation ne crée pas de doublon.
 */
export function driveIdempotencyKey(b: Booking) {
  const created = Date.parse(b.createdAt);
  return `rydar-prive-${b.ref}-${Number.isFinite(created) ? created.toString(36) : "0"}`;
}

/**
 * Envoie la réservation. Idempotent (voir driveIdempotencyKey). Une course renvoyée par Rydar Drive au titre de
 * l'idempotence mais portant une autre référence est refusée : la réservation part alors dans le groupe Telegram.
 */
export async function pushToDrive(b: Booking) {
  const json = await request("/rides", { method: "POST", body: drivePayload(b), idempotencyKey: driveIdempotencyKey(b) });
  const ride = (json?.data ?? json) as DriveRide | null;
  if (!ride || typeof ride.id !== "string") throw new DriveError("Réponse inattendue de Rydar Drive", 0, "BAD_RESPONSE");
  if (json?.idempotent_replay === true && ride.external_reference !== b.ref)
    throw new DriveError(`Rydar Drive a renvoyé une autre course (${ride.external_reference ?? "sans référence"})`, 409, "IDEMPOTENT_REPLAY");
  return ride;
}

export function getDriveRide(id: string) {
  return call<DriveRide>(`/rides/${encodeURIComponent(id)}`);
}

export function cancelDriveRide(id: string, reason: string) {
  return call<DriveRide>(`/rides/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason } });
}

export function pingDrive() {
  return call<{ ok?: boolean; scopes?: string[] }>("/ping");
}

/** « Karim · Mercedes Classe E noire · AB-123-CD » */
export function driveDriverLabel(r: DriveRide) {
  const d = r.driver;
  if (!d) return undefined;
  const v = d.vehicle;
  const car = [v?.model, v?.color].filter(Boolean).join(" ");
  return [d.first_name, car, v?.plate].filter(Boolean).join(" · ") || undefined;
}

/* ------------------------------------------------------------------ */
/* Avis en direct (webhooks) de Rydar Drive                             */
/* ------------------------------------------------------------------ */

/** Chemin de réception des avis sur ce site. */
export const DRIVE_WEBHOOK_PATH = "/api/drive/webhook";

/** Clé du stockage où l'on garde le dernier avis reçu ({ at, type }), affiché sur /setup. */
export const DRIVE_WEBHOOK_LAST_KEY = "drivewh:last";

/**
 * Secret partagé avec Rydar Drive pour signer les avis. RYDAR_DRIVE_WEBHOOK_SECRET s'il est défini, sinon dérivé
 * d'APP_SECRET (HMAC-SHA256, hexadécimal) : /setup l'envoie lui-même à Rydar Drive, personne n'a à le recopier.
 * null si aucun des deux n'existe.
 */
export function driveWebhookSecret(): string | null {
  const explicit = clean(process.env.RYDAR_DRIVE_WEBHOOK_SECRET);
  if (explicit) return explicit;
  const app = clean(process.env.APP_SECRET);
  if (!app) return null;
  return createHmac("sha256", app).update("rydar-drive-webhook:v1").digest("hex");
}

/** Écart maximal accepté entre l'horodatage de l'avis et l'horloge du site. */
export const DRIVE_WEBHOOK_TOLERANCE_SEC = 300;

/**
 * Vérifie un avis Rydar Drive : X-Rydar-Signature = « v1=<hex> » où hex = HMAC-SHA256(secret, `${X-Rydar-Timestamp}.${corps brut}`).
 * Comparaison en temps constant ; horodatage à ± 5 minutes ; tout en-tête mal formé est refusé.
 * Plusieurs signatures séparées par des virgules sont acceptées (rotation du secret) : une seule doit correspondre.
 */
export function verifyDriveSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !timestampHeader || !signatureHeader) return false;
  const ts = timestampHeader.trim();
  if (!/^\d{1,12}$/.test(ts)) return false;
  if (Math.abs(nowSec - Number(ts)) > DRIVE_WEBHOOK_TOLERANCE_SEC) return false;
  const given = signatureHeader
    .split(",")
    .map((p) => /^v1=([0-9a-f]{64})$/i.exec(p.trim())?.[1])
    .filter((h): h is string => !!h);
  if (!given.length) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
  let ok = false;
  for (const hex of given) {
    const b = Buffer.from(hex, "hex");
    if (b.length === expected.length && timingSafeEqual(b, expected)) ok = true;
  }
  return ok;
}

export interface DriveWebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  disabled_reason: string | null;
  created_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
}

/** Adresse de réception des avis pour ce site. */
export function driveWebhookUrl(site: string) {
  return `${site.replace(/\/+$/, "")}${DRIVE_WEBHOOK_PATH}`;
}

/**
 * Inscrit (ou réactive) ce site auprès de Rydar Drive pour tous les événements, avec le secret partagé.
 * Idempotent : même adresse = mise à jour (le secret est remplacé, l'abonnement réactivé).
 * Exige la permission « webhooks:manage » sur la clé API.
 */
export async function registerDriveWebhook(site: string): Promise<{ endpoint: DriveWebhookEndpoint; created: boolean }> {
  const secret = driveWebhookSecret();
  if (!secret) throw new DriveError("Secret des avis introuvable : définissez APP_SECRET (ou RYDAR_DRIVE_WEBHOOK_SECRET).", 0, "NO_SECRET");
  const json = await request("/webhooks", { method: "POST", body: { url: driveWebhookUrl(site), description: "RYDAR Privé", secret } });
  return { endpoint: json?.data as DriveWebhookEndpoint, created: json?.created === true };
}

export function listDriveWebhooks() {
  return call<DriveWebhookEndpoint[]>("/webhooks");
}

/** Demande à Rydar Drive un avis de test (« ping ») vers cette adresse. */
export function testDriveWebhook(id: string) {
  return call<{ delivery_id: string }>(`/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" });
}
