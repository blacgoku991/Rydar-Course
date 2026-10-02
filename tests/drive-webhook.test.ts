import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ride } from "@/lib/rides";
import type { Booking } from "@/lib/types";

/* Stockage des courses et Telegram simulés ; anti-doublon = stockage mémoire réel (kv). */
const h = vi.hoisted(() => ({
  db: new Map<string, string>(),
  failStore: false,
  failTelegram: false,
  /** Appelé pendant l'envoi de la fiche admin (avis arrivé au même moment). */
  slowAdmin: null as null | (() => Promise<void>),
  calls: [] as { method: string; payload: Record<string, unknown> }[],
}));

vi.mock("@/lib/rides", () => ({
  logLine: (text: string, at = new Date()) => ({ at: at.toISOString(), text }),
  loadRide: async (ref: string) => {
    const raw = h.db.get(ref);
    return raw ? { ride: JSON.parse(raw), version: raw } : null;
  },
  saveRide: async (ride: Ride, version: string | null) => {
    if (h.failStore) throw new Error("stockage indisponible");
    const cur = h.db.get(ride.booking.ref) ?? null;
    if (cur !== version) return false;
    h.db.set(ride.booking.ref, JSON.stringify(ride));
    return true;
  },
  recentRides: async () => [],
  updateRide: async (ref: string, mutate: (r: Ride) => Ride | null) => {
    if (h.failStore) throw new Error("stockage indisponible");
    const raw = h.db.get(ref);
    if (!raw) return { ok: false, reason: "not_found" };
    const next = mutate(JSON.parse(raw));
    if (!next) return { ok: false, reason: "rejected" };
    h.db.set(ref, JSON.stringify(next));
    return { ok: true, ride: next, before: JSON.parse(raw) };
  },
}));

vi.mock("@/lib/telegram/api", () => {
  class TelegramError extends Error {}
  const send = async (method: string, payload: Record<string, unknown>) => {
    h.calls.push({ method, payload });
    if (method === "sendMessage" && h.slowAdmin) {
      const during = h.slowAdmin;
      h.slowAdmin = null;
      await during();
    }
    if (h.failTelegram) throw new TelegramError("Telegram en panne");
    return { message_id: 99, username: "rydar_bot" };
  };
  return {
    TelegramError,
    telegramConfigured: () => true,
    tg: send,
    sendToCentral: (payload: Record<string, unknown>) => send("sendToCentral", payload),
  };
});

const { POST } = await import("@/app/api/drive/webhook/route");
const { postBookingToCentral } = await import("@/lib/telegram/central");
const { kv } = await import("@/lib/store");

const APP_SECRET = "secret-applicatif-de-test";
const SECRET = createHmac("sha256", APP_SECRET).update("rydar-drive-webhook:v1").digest("hex");

const booking: Booking = {
  ref: "RP-ABCDE",
  createdAt: "2026-10-02T08:00:00Z",
  source: "web",
  locale: "fr",
  service: "transfer",
  pickup: { id: "a", label: "12 Rue Houdan", kind: "address", lat: 48.75, lon: 2.3, postcode: "92160", city: "Antony" },
  dropoff: { id: "known:cdg-2e", label: "CDG 2E", kind: "airport", lat: 49, lon: 2.58 },
  date: "2026-10-10",
  time: "09:30",
  hours: null,
  passengers: 2,
  luggage: 1,
  childSeats: 0,
  vehicle: "business",
  priceCents: 7500,
  fixed: true,
  distanceKm: 31.5,
  durationMin: 45,
  customer: { name: "Jean Dupont", phone: "+33612345678" },
};

function seed(drive: Partial<NonNullable<Ride["drive"]>> = {}, over: Partial<Ride> = {}) {
  const ride: Ride = {
    booking,
    status: "open",
    adminMsgId: 7,
    drive: { id: "drv-1", number: 1928, status: "SEARCHING_DRIVER", ...drive },
    log: [{ at: booking.createdAt, text: "Reçue (site)" }],
    ...over,
  };
  h.db.set(booking.ref, JSON.stringify(ride));
}
const stored = () => JSON.parse(h.db.get(booking.ref)!) as Ride;

let seq = 0;
function event(type: string, ride: Record<string, unknown> | null = {}, id = randomUUID()) {
  seq += 1;
  return {
    id,
    type,
    created_at: new Date().toISOString(),
    api_version: "2026-10-01",
    data:
      type === "ping"
        ? {}
        : {
            ride: ride && {
              id: "drv-1",
              number: 1928,
              status: "ACCEPTED",
              external_reference: "RP-ABCDE",
              driver: { first_name: "Karim", vehicle: { model: "Mercedes Classe E", color: "noire", plate: "AB-123-CD" } },
              updated_at: new Date(Date.UTC(2026, 9, 2, 10, 0, seq)).toISOString(),
              ...ride,
            },
            status: ride?.status ?? "ACCEPTED",
            previous_status: null,
          },
  };
}

function request(body: unknown, opts: { secret?: string; ts?: number; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.secret ?? SECRET)
    .update(`${ts}.${raw}`)
    .digest("hex");
  return new Request("https://rydarprive.test/api/drive/webhook", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "x-rydar-timestamp": ts, "x-rydar-signature": `v1=${sig}` },
    body: raw,
  });
}

const alerts = () => h.calls.filter((c) => c.method === "sendMessage" || c.method === "sendToCentral");

beforeEach(() => {
  process.env.APP_SECRET = APP_SECRET;
  delete process.env.RYDAR_DRIVE_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "42";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  (globalThis as unknown as { __rydarKV?: unknown }).__rydarKV = undefined;
  h.db.clear();
  h.calls.length = 0;
  h.failStore = false;
  h.failTelegram = false;
  h.slowAdmin = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/drive/webhook", () => {
  it("refuse une signature invalide (401) sans rien modifier", async () => {
    seed();
    const res = await POST(request(event("ride.accepted"), { secret: "mauvais-secret" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_signature");
    expect(stored().status).toBe("open");
    expect(h.calls).toHaveLength(0);
  });

  it("refuse un avis trop ancien et un corps trop volumineux", async () => {
    seed();
    expect((await POST(request(event("ride.accepted"), { ts: Math.floor(Date.now() / 1000) - 600 }))).status).toBe(401);
    const big = JSON.stringify({ ...event("ping"), pad: "x".repeat(70 * 1024) });
    expect((await POST(request(null, { raw: big }))).status).toBe(413);
  });

  it("ping : 200 et dernier avis mémorisé pour /setup", async () => {
    const res = await POST(request(event("ping")));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    const last = JSON.parse((await kv().get("drivewh:last"))!);
    expect(last.type).toBe("ping");
    expect(Date.now() - Date.parse(last.at)).toBeLessThan(5000);
  });

  it("chauffeur attribué : fiche mise à jour, aucun message en plus", async () => {
    seed();
    const res = await POST(request(event("ride.accepted")));
    expect(res.status).toBe(200);
    expect(stored().status).toBe("taken");
    expect(stored().drive?.driver).toBe("Karim · Mercedes Classe E noire · AB-123-CD");
    expect(h.calls.some((c) => c.method === "editMessageText" && c.payload.message_id === 7)).toBe(true);
    expect(alerts()).toHaveLength(0);
  });

  it("avis en double : traité une seule fois", async () => {
    seed();
    const ev = event("ride.accepted");
    expect((await POST(request(ev))).status).toBe(200);
    const again = await POST(request(ev));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
  });

  it("course inconnue ou référence étrangère : ignorée (200)", async () => {
    seed();
    const unknown = await POST(request(event("ride.accepted", { external_reference: "RP-ZZZZZ" })));
    expect(await unknown.json()).toEqual({ ok: true, ignored: true });
    const foreign = await POST(request(event("ride.accepted", { external_reference: "COMMANDE-42" })));
    expect(await foreign.json()).toEqual({ ok: true, ignored: true });
    const deleted = await POST(request(event("ride.cancelled", null)));
    expect(await deleted.json()).toEqual({ ok: true, ignored: true });
    // Même référence, mais autre course Rydar Drive (créée à la main) : ignorée
    const other = await POST(request(event("ride.accepted", { id: "drv-autre" })));
    expect(await other.json()).toEqual({ ok: true, ignored: true });
    expect(stored().status).toBe("open");
  });

  it("aucun chauffeur trouvé : une seule alerte admin, en réponse à la fiche", async () => {
    seed();
    const res = await POST(request(event("ride.no_driver_found", { status: "NO_DRIVER_FOUND", driver: null })));
    expect(res.status).toBe(200);
    expect(alerts()).toHaveLength(1);
    const msg = alerts()[0].payload;
    expect(msg.chat_id).toBe("42");
    expect(msg.text).toContain("aucun chauffeur trouvé");
    expect(msg.text).toContain("RP-ABCDE");
    expect(msg.reply_parameters).toMatchObject({ message_id: 7 });
    // Autre avis portant le même état (nouvel id) : pas de seconde alerte
    await POST(request(event("ride.no_driver_found", { status: "NO_DRIVER_FOUND", driver: null })));
    expect(alerts()).toHaveLength(1);
  });

  it("annulation : alerte si elle vient de Rydar Drive, pas si elle vient de RYDAR Privé", async () => {
    seed({ status: "ACCEPTED" }, { status: "taken" });
    await POST(request(event("ride.cancelled", { status: "CANCELLED" })));
    expect(stored().status).toBe("cancelled");
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].payload.text).toContain("Course annulée dans Rydar Drive");

    h.calls.length = 0;
    seed({ status: "ACCEPTED", cancelBy: "Sam" }, { status: "taken" });
    await POST(request(event("ride.cancelled", { status: "CANCELLED" })));
    expect(stored().status).toBe("cancelled");
    expect(stored().log.map((l) => l.text)).toContain("❌ Annulée par Sam");
    expect(alerts()).toHaveLength(0);
  });

  it("une panne Telegram ne fait pas échouer l'avis", async () => {
    seed();
    h.failTelegram = true;
    const res = await POST(request(event("ride.no_driver_found", { status: "NO_DRIVER_FOUND", driver: null })));
    expect(res.status).toBe(200);
    expect(stored().drive?.status).toBe("NO_DRIVER_FOUND");
  });

  it("échec du stockage : 500 et anti-doublon libéré pour le renvoi", async () => {
    seed();
    const ev = event("ride.accepted");
    h.failStore = true;
    const res = await POST(request(ev));
    expect(res.status).toBe(500);
    expect(await kv().get(`drivewh:${ev.id}`)).toBeNull();
    h.failStore = false;
    const retry = await POST(request(ev));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, updated: true });
    expect(stored().status).toBe("taken");
  });

  it("un avis arrivé en retard ne fait pas reculer la course", async () => {
    seed();
    const late = event("ride.accepted", { status: "ACCEPTED", updated_at: "2026-10-02T10:00:00Z" });
    await POST(request(event("ride.driver_arrived", { status: "DRIVER_ARRIVED", updated_at: "2026-10-02T10:30:00Z" })));
    const res = await POST(request(late));
    expect(await res.json()).toEqual({ ok: true, updated: false });
    expect(stored().drive?.status).toBe("DRIVER_ARRIVED");
  });
});

describe("avis arrivé avant l'enregistrement de la course (réservation en cours)", () => {
  const young = () => ({ timestamps: { created_at: new Date(Date.now() - 2000).toISOString() } });

  it("409 à réessayer, avis gardé de côté puis appliqué à l'enregistrement", async () => {
    const ev = event("ride.accepted", young());
    const res = await POST(request(ev));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not_ready");
    // L'anti-doublon est libéré : le renvoi de Rydar Drive sera traité.
    expect(await kv().get(`drivewh:${ev.id}`)).toBeNull();
    const held = JSON.parse((await kv().get("drivewh:early:RP-ABCDE"))!);
    expect(held.status).toBe("ACCEPTED");
    expect(held.customer).toBeUndefined();

    // La réservation se termine : course enregistrée AVANT la fiche admin, avis gardé appliqué tout de suite.
    await postBookingToCentral(booking, { drive: { id: "drv-1", number: 1928, status: "SEARCHING_DRIVER", external_reference: "RP-ABCDE" } });
    expect(stored().status).toBe("taken");
    expect(stored().drive?.driver).toBe("Karim · Mercedes Classe E noire · AB-123-CD");
    expect(stored().adminMsgId).toBe(99);
    const card = h.calls.find((c) => c.method === "sendMessage");
    expect(card?.payload.text).toContain("Chauffeur attribué");
    expect(await kv().get("drivewh:early:RP-ABCDE")).toBeNull();

    // Renvoi de Rydar Drive une minute plus tard : traité normalement (déjà à jour).
    const retry = await POST(request(ev));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, updated: false });
  });

  it("un avis gardé pour une autre course Rydar Drive (même référence) n'est jamais appliqué", async () => {
    await POST(request(event("ride.completed", { id: "drv-etrangere", status: "COMPLETED", ...young() })));
    await postBookingToCentral(booking, { drive: { id: "drv-1", number: 1928, status: "SEARCHING_DRIVER", external_reference: "RP-ABCDE" } });
    expect(stored().status).toBe("open");
    expect(stored().drive?.status).toBe("SEARCHING_DRIVER");
  });

  it("un avis gardé plus ancien ne remplace pas le plus récent", async () => {
    await POST(request(event("ride.driver_arrived", { status: "DRIVER_ARRIVED", ...young(), updated_at: "2026-10-02T10:30:00Z" })));
    await POST(request(event("ride.accepted", { status: "ACCEPTED", ...young(), updated_at: "2026-10-02T10:00:00Z" })));
    expect(JSON.parse((await kv().get("drivewh:early:RP-ABCDE"))!).status).toBe("DRIVER_ARRIVED");
  });

  it("course créée il y a longtemps et inconnue ici : ignorée (200), pas de renvoi", async () => {
    const res = await POST(request(event("ride.accepted", { timestamps: { created_at: "2026-01-01T00:00:00Z" } })));
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(await kv().get("drivewh:early:RP-ABCDE")).toBeNull();
  });

  it("un avis appliqué pendant l'envoi de la fiche admin la remet à jour", async () => {
    h.slowAdmin = async () => {
      await POST(request(event("ride.accepted")));
    };
    await postBookingToCentral(booking, { drive: { id: "drv-1", number: 1928, status: "SEARCHING_DRIVER", external_reference: "RP-ABCDE" } });
    expect(stored().status).toBe("taken");
    expect(stored().adminMsgId).toBe(99);
    const edits = h.calls.filter((c) => c.method === "editMessageText" && c.payload.message_id === 99);
    expect(edits.at(-1)?.payload.text).toContain("Chauffeur attribué");
  });
});

describe("anti-doublon : un traitement interrompu n'est pas perdu", () => {
  it("traitement en cours (ou interrompu) : 409, puis repris après le bail", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    seed();
    const ev = event("ride.completed", { status: "COMPLETED" });
    // Invocation tuée après la prise du verrou (délai dépassé, instance arrêtée) : il reste « en cours ».
    await kv().setNX(`drivewh:${ev.id}`, "processing", 45);
    const during = await POST(request(ev));
    expect(during.status).toBe(409);
    expect((await during.json()).error).toBe("in_progress");
    expect(stored().status).toBe("open");

    // Renvoi de Rydar Drive 60 s plus tard : le bail a expiré, l'avis est appliqué.
    vi.setSystemTime(Date.now() + 60_000);
    const retry = await POST(request(ev));
    expect(await retry.json()).toEqual({ ok: true, updated: true });
    expect(stored().status).toBe("done");
    expect(await kv().get(`drivewh:${ev.id}`)).toBe("done");
    // Puis « traité » : un nouveau renvoi est acquitté sans être rejoué.
    expect(await (await POST(request(ev))).json()).toEqual({ ok: true, duplicate: true });
  });

  it("renvoi après une coupure entre l'enregistrement et la fiche : fiche remise à jour", async () => {
    seed();
    const ev = event("ride.accepted");
    // Première invocation : course enregistrée, puis coupure avant la fiche et avant « traité ».
    const rides = await import("@/lib/rides");
    await rides.updateRide("RP-ABCDE", (r) => {
      r.status = "taken";
      r.drive = { ...r.drive!, status: "ACCEPTED", driver: "Karim · Mercedes Classe E noire · AB-123-CD", updatedAt: ev.data!.ride!.updated_at as string };
      return r;
    });
    h.calls.length = 0;
    const res = await POST(request(ev));
    expect(await res.json()).toEqual({ ok: true, updated: false });
    const edit = h.calls.find((c) => c.method === "editMessageText" && c.payload.message_id === 7);
    expect(edit?.payload.text).toContain("Chauffeur attribué");
  });

  it("ping : marqué traité seulement une fois la réponse prête", async () => {
    const ev = event("ping");
    expect((await POST(request(ev))).status).toBe(200);
    expect(await kv().get(`drivewh:${ev.id}`)).toBe("done");
  });
});
