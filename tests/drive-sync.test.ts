import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { DRIVE_FINAL, driveWebhookSecret, verifyDriveSignature, type DriveRide } from "@/lib/drive";
import { driveAlertKind, isNewerDriveRide, isRecentDriveRide, localStatusOf, mergeDriveRide, trimDriveRide } from "@/lib/drive-sync";
import type { Ride } from "@/lib/rides";
import { adminKeyboard, adminText, driveAlertText, pickupOf } from "@/lib/telegram/format";
import type { Booking } from "@/lib/types";

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

const ride = (drive: Partial<NonNullable<Ride["drive"]>> = {}, over: Partial<Ride> = {}): Ride => ({
  booking,
  status: "open",
  drive: { id: "drv-1", number: 1928, status: "SEARCHING_DRIVER", ...drive },
  log: [{ at: booking.createdAt, text: "Reçue (site)" }],
  ...over,
});

const karim = { first_name: "Karim", vehicle: { model: "Mercedes Classe E", color: "noire", plate: "AB-123-CD" } };
const snap = (over: Partial<DriveRide> = {}): DriveRide => ({
  id: "drv-1",
  number: 1928,
  status: "ACCEPTED",
  driver: karim,
  external_reference: "RP-ABCDE",
  updated_at: "2026-10-02T10:00:00.000Z",
  ...over,
});
const texts = (r: Ride | null) => r?.log.map((l) => l.text) ?? [];

/* ------------------------------------------------------------------ */

describe("signature des avis Rydar Drive", () => {
  const secret = "whsec_" + "a".repeat(48);
  const body = JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", type: "ping", data: {} });
  const now = 1_790_000_000;
  const sign = (ts: number | string, raw = body, key = secret) => `v1=${createHmac("sha256", key).update(`${ts}.${raw}`).digest("hex")}`;

  it("accepte une signature valide", () => {
    expect(verifyDriveSignature(body, String(now), sign(now), secret, now)).toBe(true);
    expect(verifyDriveSignature(body, String(now - 300), sign(now - 300), secret, now)).toBe(true);
    expect(verifyDriveSignature(body, String(now), sign(now).toUpperCase().replace("V1=", "v1="), secret, now)).toBe(true);
  });

  it("refuse un mauvais secret ou un corps modifié", () => {
    expect(verifyDriveSignature(body, String(now), sign(now, body, "autre-secret"), secret, now)).toBe(false);
    expect(verifyDriveSignature(body.replace("ping", "ride.completed"), String(now), sign(now), secret, now)).toBe(false);
    // Horodatage modifié après signature
    expect(verifyDriveSignature(body, String(now + 1), sign(now), secret, now)).toBe(false);
  });

  it("refuse un horodatage trop ancien ou trop dans le futur", () => {
    expect(verifyDriveSignature(body, String(now - 301), sign(now - 301), secret, now)).toBe(false);
    expect(verifyDriveSignature(body, String(now + 301), sign(now + 301), secret, now)).toBe(false);
  });

  it("refuse les en-têtes mal formés", () => {
    const good = sign(now);
    for (const ts of [null, "", "abc", "12.5", "-5", " 1 2", "1".repeat(13)]) expect(verifyDriveSignature(body, ts, good, secret, now)).toBe(false);
    for (const sig of [null, "", "abc", "v1=", "v1=zz", good.slice(0, -1), `sha256=${good.slice(3)}`, `v2=${good.slice(3)}`, good.slice(3)])
      expect(verifyDriveSignature(body, String(now), sig, secret, now)).toBe(false);
    expect(verifyDriveSignature(body, String(now), good, "", now)).toBe(false);
  });

  it("accepte plusieurs signatures (rotation du secret) si l'une correspond", () => {
    expect(verifyDriveSignature(body, String(now), `${sign(now, body, "ancien")}, ${sign(now)}`, secret, now)).toBe(true);
    expect(verifyDriveSignature(body, String(now), `${sign(now, body, "ancien")},v1=nimporte`, secret, now)).toBe(false);
  });
});

describe("secret des avis", () => {
  const saved = { app: process.env.APP_SECRET, wh: process.env.RYDAR_DRIVE_WEBHOOK_SECRET };
  afterEach(() => {
    process.env.APP_SECRET = saved.app;
    process.env.RYDAR_DRIVE_WEBHOOK_SECRET = saved.wh;
    if (saved.app === undefined) delete process.env.APP_SECRET;
    if (saved.wh === undefined) delete process.env.RYDAR_DRIVE_WEBHOOK_SECRET;
  });

  it("est dérivé d'APP_SECRET, de façon stable", () => {
    delete process.env.RYDAR_DRIVE_WEBHOOK_SECRET;
    process.env.APP_SECRET = "mon-secret-applicatif";
    const expected = createHmac("sha256", "mon-secret-applicatif").update("rydar-drive-webhook:v1").digest("hex");
    expect(driveWebhookSecret()).toBe(expected);
    expect(driveWebhookSecret()).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    process.env.APP_SECRET = "autre";
    expect(driveWebhookSecret()).not.toBe(expected);
  });

  it("RYDAR_DRIVE_WEBHOOK_SECRET l'emporte ; sans rien : null", () => {
    process.env.APP_SECRET = "x";
    process.env.RYDAR_DRIVE_WEBHOOK_SECRET = "  whsec_manuel  ";
    expect(driveWebhookSecret()).toBe("whsec_manuel");
    delete process.env.RYDAR_DRIVE_WEBHOOK_SECRET;
    process.env.APP_SECRET = " ";
    expect(driveWebhookSecret()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("mise à jour d'une course d'après Rydar Drive", () => {
  it("chauffeur attribué → attribuée, chauffeur et historique", () => {
    const r = mergeDriveRide(ride(), snap());
    expect(r?.status).toBe("taken");
    expect(r?.drive).toMatchObject({ status: "ACCEPTED", driver: "Karim · Mercedes Classe E noire · AB-123-CD", updatedAt: "2026-10-02T10:00:00.000Z" });
    expect(texts(r)).toContain("Rydar Drive : 🟢 Chauffeur attribué");
    expect(texts(r)).toContain("👤 Karim · Mercedes Classe E noire · AB-123-CD");
  });

  it("chauffeur retiré → de nouveau en attente", () => {
    const before = ride({ status: "ACCEPTED", driver: "Karim · AB-123-CD" }, { status: "taken" });
    const r = mergeDriveRide(before, snap({ status: "SEARCHING_DRIVER", driver: null }));
    expect(r?.status).toBe("open");
    expect(r?.drive?.driver).toBeUndefined();
    expect(texts(r)).toContain("↩️ Karim · AB-123-CD n'est plus sur la course");
  });

  it("terminée, annulée, aucun chauffeur", () => {
    const done = mergeDriveRide(ride({ status: "IN_PROGRESS", driver: "Karim" }, { status: "taken" }), snap({ status: "COMPLETED", driver: null }));
    expect(done?.status).toBe("done");
    expect(done?.drive?.driver).toBe("Karim"); // gardé pour l'historique
    expect(mergeDriveRide(ride(), snap({ status: "CANCELLED", driver: null }))?.status).toBe("cancelled");
    const ndf = mergeDriveRide(ride(), snap({ status: "NO_DRIVER_FOUND", driver: null }));
    expect(ndf?.status).toBe("open");
    expect(texts(ndf)).toContain("Rydar Drive : ⚠️ Aucun chauffeur trouvé");
    expect(localStatusOf("PASSENGER_ONBOARD")).toBe("taken");
    expect(localStatusOf("STATUT_FUTUR")).toBeNull();
  });

  it("ignore un instantané plus ancien (avis en double ou dans le désordre)", () => {
    const first = mergeDriveRide(ride(), snap({ status: "DRIVER_EN_ROUTE", updated_at: "2026-10-02T10:05:00Z" }))!;
    expect(first.drive?.status).toBe("DRIVER_EN_ROUTE");
    expect(mergeDriveRide(first, snap({ status: "ACCEPTED", updated_at: "2026-10-02T10:00:00Z" }))).toBeNull();
    // Même instantané reçu deux fois : rien à écrire
    expect(mergeDriveRide(first, snap({ status: "DRIVER_EN_ROUTE", updated_at: "2026-10-02T10:05:00Z" }))).toBeNull();
    // Plus récent : appliqué
    expect(mergeDriveRide(first, snap({ status: "DRIVER_ARRIVED", updated_at: "2026-10-02T10:20:00Z" }))?.drive?.status).toBe("DRIVER_ARRIVED");
  });

  it("une course terminée ou annulée ne revient jamais en arrière", () => {
    expect(mergeDriveRide(ride({ status: "COMPLETED" }, { status: "done" }), snap({ status: "IN_PROGRESS", updated_at: null }))).toBeNull();
    expect(mergeDriveRide(ride({ status: "CANCELLED" }, { status: "cancelled" }), snap({ status: "ACCEPTED", updated_at: null }))).toBeNull();
  });

  it("ignore une autre course Rydar Drive ou une course non liée", () => {
    expect(mergeDriveRide(ride(), snap({ id: "autre" }))).toBeNull();
    expect(mergeDriveRide(ride({}, { drive: undefined }), snap())).toBeNull();
  });

  it("signale un changement d'heure par rapport à l'heure déjà connue", () => {
    const silent = mergeDriveRide(ride(), snap({ status: "SEARCHING_DRIVER", driver: null, pickup_at: "2026-10-10T07:30:00Z" }));
    expect(silent?.drive?.pickupAt).toBe("2026-10-10T07:30:00Z");
    expect(texts(silent).some((t) => t.startsWith("🕒"))).toBe(false);
    const moved = mergeDriveRide(
      silent!,
      snap({ status: "SEARCHING_DRIVER", driver: null, pickup_at: "2026-10-10T08:15:00Z", updated_at: "2026-10-02T11:00:00Z" }),
    );
    expect(
      texts(moved)
        .find((t) => t.startsWith("🕒"))
        ?.replace(/\s/g, " "),
    ).toBe("🕒 Prise en charge déplacée : sam. 10/10 10:15");
    // Même instant écrit autrement : pas de changement
    expect(mergeDriveRide(silent!, snap({ status: "SEARCHING_DRIVER", driver: null, pickup_at: "2026-10-10T07:30:00+00:00" }))).toBeNull();
  });

  it("garde le statut local si Rydar Drive renvoie un statut inconnu", () => {
    const r = mergeDriveRide(ride({}, { status: "open" }), snap({ status: "STATUT_FUTUR", driver: null }));
    expect(r?.status).toBe("open");
    expect(r?.drive?.status).toBe("STATUT_FUTUR");
  });
});

describe("alertes admin", () => {
  it("aucun chauffeur trouvé : une alerte à la transition seulement", () => {
    const before = ride();
    const after = mergeDriveRide(before, snap({ status: "NO_DRIVER_FOUND", driver: null }))!;
    expect(driveAlertKind(before, after)).toBe("no_driver");
    expect(driveAlertKind(after, after)).toBeNull();
    expect(driveAlertText(after, "no_driver")).toContain("aucun chauffeur trouvé");
    expect(driveAlertText(after, "no_driver")).toContain("<code>RP-ABCDE</code> · n° 1928");
  });

  it("annulation : alerte si elle ne vient pas de RYDAR Privé", () => {
    const before = ride({ status: "ACCEPTED" }, { status: "taken" });
    const after = mergeDriveRide(before, snap({ status: "CANCELLED" }))!;
    expect(driveAlertKind(before, after)).toBe("cancelled");
    const ours = ride({ status: "ACCEPTED", cancelBy: "Admin" }, { status: "taken" });
    const oursAfter = mergeDriveRide(ours, snap({ status: "CANCELLED" }))!;
    expect(driveAlertKind(ours, oursAfter)).toBeNull();
    expect(texts(oursAfter)).toContain("❌ Annulée par Admin");
  });

  it("aucun chauffeur trouvé n'est pas définitif : l'admin peut encore annuler", () => {
    expect(DRIVE_FINAL.has("NO_DRIVER_FOUND")).toBe(false);
    const buttons = adminKeyboard(ride({ status: "NO_DRIVER_FOUND" })).inline_keyboard.flat();
    expect(buttons.some((b) => b.callback_data === "rp:cancel:RP-ABCDE")).toBe(true);
  });
});

describe("avis arrivé avant l'enregistrement de la course", () => {
  const now = Date.parse("2026-10-02T10:00:00Z");

  it("course récente seulement (date de création Rydar Drive)", () => {
    expect(isRecentDriveRide(snap({ timestamps: { created_at: "2026-10-02T09:59:58Z" } }), now)).toBe(true);
    expect(isRecentDriveRide(snap({ timestamps: { created_at: "2026-10-02T09:44:00Z" } }), now)).toBe(false);
    expect(isRecentDriveRide(snap({ timestamps: null }), now)).toBe(false);
    expect(isRecentDriveRide(snap(), now)).toBe(false);
  });

  it("garde le plus récent et aucune donnée client", () => {
    const old = snap({ status: "OFFERED", updated_at: "2026-10-02T10:00:00Z" });
    const recent = snap({ updated_at: "2026-10-02T10:00:05Z" });
    expect(isNewerDriveRide(old, recent)).toBe(true);
    expect(isNewerDriveRide(recent, old)).toBe(false);
    expect(isNewerDriveRide(recent, snap({ id: "drv-autre", updated_at: "2026-10-02T09:00:00Z" }))).toBe(true);
    const kept = trimDriveRide({ ...recent, customer: { name: "Jean Dupont" } } as unknown as DriveRide);
    expect(Object.keys(kept).sort()).toEqual(["driver", "external_reference", "id", "number", "pickup_at", "status", "updated_at"]);
  });
});

describe("course déplacée dans Rydar Drive", () => {
  it("la fiche admin affiche la nouvelle heure, l'ancienne barrée", () => {
    // Réservée le samedi 10/10 à 09:30 (Paris) ; Rydar Drive déplace la prise en charge à 11:00 (Paris).
    const before = ride({ pickupAt: "2026-10-10T07:30:00Z" });
    expect(pickupOf(before)).toEqual({ date: "2026-10-10", time: "09:30", moved: false });
    expect(adminText(before)).toContain("📅 Samedi 10 octobre 2026 · <b>09:30</b>\n");

    const moved = mergeDriveRide(
      before,
      snap({ status: "SEARCHING_DRIVER", driver: null, pickup_at: "2026-10-10T09:00:00Z", updated_at: "2026-10-02T11:00:00Z" }),
    )!;
    expect(pickupOf(moved)).toEqual({ date: "2026-10-10", time: "11:00", moved: true });
    const t = adminText(moved);
    expect(t).toContain("📅 Samedi 10 octobre 2026 · <b>11:00</b> (déplacée, initialement <s>09:30</s>)");
    expect(t).not.toContain("<b>09:30</b>");
    expect(driveAlertText(moved, "no_driver")).toContain("· 11:00 ·");
  });

  it("autre jour : l'ancienne date est rappelée", () => {
    const moved = ride({ pickupAt: "2026-10-11T06:00:00Z" });
    expect(adminText(moved)).toContain("📅 Dimanche 11 octobre 2026 · <b>08:00</b> (déplacée, initialement <s>10/10 09:30</s>)");
  });

  it("même instant écrit autrement : rien de déplacé", () => {
    expect(pickupOf(ride({ pickupAt: "2026-10-10T09:30:00+02:00" })).moved).toBe(false);
    expect(pickupOf(ride({ pickupAt: "pas une date" })).moved).toBe(false);
  });
});
