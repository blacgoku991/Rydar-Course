import "server-only";
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

/** Statuts finaux côté Rydar Drive. */
export const DRIVE_FINAL = new Set(["COMPLETED", "CANCELLED", "NO_DRIVER_FOUND"]);

export interface DriveRide {
  id: string;
  number?: number;
  status: string;
  driver?: { first_name?: string; vehicle?: { model?: string; color?: string; plate?: string } } | null;
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

async function call<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
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
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok) {
    const e = json?.error;
    const details = e?.details ? ` ${JSON.stringify(e.details).slice(0, 200)}` : "";
    throw new DriveError(`${e?.message ?? `HTTP ${res.status}`}${details}`, res.status, e?.code ?? `HTTP_${res.status}`);
  }
  return (json?.data ?? json) as T;
}

/** Envoie la réservation. Idempotent : un renvoi avec la même référence ne crée pas de doublon. */
export function pushToDrive(b: Booking) {
  return call<DriveRide>("/rides", { method: "POST", body: drivePayload(b), idempotencyKey: `rydar-prive-${b.ref}` });
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
