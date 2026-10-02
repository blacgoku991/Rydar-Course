import "server-only";
import { BlobPreconditionFailedError, get, list, put } from "@vercel/blob";
import { kv } from "@/lib/store";
import type { Booking } from "@/lib/types";

/**
 * Suivi des courses de la centrale (statut, chauffeur, messages Telegram, historique).
 * Stockage : Vercel Blob privé si BLOB_READ_WRITE_TOKEN est défini (écritures
 * conditionnelles = un seul chauffeur par course), sinon le stockage clé/valeur.
 */

export type RideStatus = "open" | "taken" | "done" | "cancelled";

export interface RideDriver {
  id: number;
  name: string;
  username?: string;
}

export interface Ride {
  booking: Booking;
  status: RideStatus;
  driver?: RideDriver;
  groupMsgId?: number;
  adminMsgId?: number;
  driverMsgId?: number;
  test?: boolean;
  /** Course envoyée à Rydar Drive (dispatch) : id, numéro, dernier statut connu, chauffeur. */
  drive?: {
    id: string;
    number?: number;
    status: string;
    driver?: string;
    /** updated_at du dernier instantané Rydar Drive appliqué (avis en direct) : un instantané plus ancien est ignoré. */
    updatedAt?: string;
    /** Heure de prise en charge connue côté Rydar Drive (ISO), pour signaler un changement d'heure. */
    pickupAt?: string;
    /** Admin qui a demandé l'annulation depuis Telegram : l'avis « annulée » de Rydar Drive vient alors d'ici. */
    cancelBy?: string;
  };
  log: { at: string; text: string }[];
}

export interface Versioned {
  ride: Ride;
  version: string;
}

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const path = (ref: string) => `rides/${ref}.json`;
const TTL = 60 * 60 * 24 * 120;

export function rideStorageKind() {
  return useBlob() ? "blob" : kv().kind;
}

export async function loadRide(ref: string): Promise<Versioned | null> {
  if (useBlob()) {
    const res = await get(path(ref), { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    return { ride: JSON.parse(text) as Ride, version: res.blob.etag };
  }
  const raw = await kv().get(`ride:${ref}`);
  return raw ? { ride: JSON.parse(raw) as Ride, version: raw } : null;
}

/**
 * Enregistre la course. `version` = version lue (null pour une création).
 * Retourne false si quelqu'un d'autre l'a modifiée entre-temps.
 */
export async function saveRide(ride: Ride, version: string | null): Promise<boolean> {
  const body = JSON.stringify(ride);
  if (useBlob()) {
    try {
      await put(path(ride.booking.ref), body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(version ? { ifMatch: version } : { allowOverwrite: false }),
      });
      return true;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) return false;
      if (!version && /already exists/i.test((err as Error).message)) return false;
      throw err;
    }
  }
  const store = kv();
  const key = `ride:${ride.booking.ref}`;
  // Verrou court pour sérialiser les écritures concurrentes.
  if (!(await store.setNX(`${key}:w`, "1", 5))) return false;
  try {
    const current = await store.get(key);
    if ((current ?? null) !== version) return false;
    await store.set(key, body, TTL);
    return true;
  } finally {
    await store.del(`${key}:w`);
  }
}

/** Lit, modifie et enregistre avec quelques tentatives en cas de conflit. */
export async function updateRide(
  ref: string,
  mutate: (ride: Ride) => Ride | null,
): Promise<{ ok: true; ride: Ride; before: Ride } | { ok: false; reason: "not_found" | "rejected" | "conflict" }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await loadRide(ref);
    if (!cur) return { ok: false, reason: "not_found" };
    const before = structuredClone(cur.ride);
    const next = mutate(structuredClone(cur.ride));
    if (!next) return { ok: false, reason: "rejected" };
    if (await saveRide(next, cur.version)) return { ok: true, ride: next, before };
  }
  return { ok: false, reason: "conflict" };
}

/** Dernières courses (commande /courses). */
export async function recentRides(limit = 15): Promise<Ride[]> {
  if (!useBlob()) return [];
  const { blobs } = await list({ prefix: "rides/", limit: 200 });
  const latest = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(0, limit);
  const rides = await Promise.all(latest.map((b) => loadRide(b.pathname.slice(6, -5)).catch(() => null)));
  return rides.filter((r): r is Versioned => !!r).map((r) => r.ride);
}

export function logLine(text: string, at = new Date()) {
  return { at: at.toISOString(), text };
}
