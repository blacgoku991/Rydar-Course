import { describe, expect, it } from "vitest";
import { lastNoticeLine, liveTrackingDetail, type DriveWebhookStatus } from "@/app/setup/drive-status";

const base: DriveWebhookStatus = {
  url: "https://rydarprive.test/api/drive/webhook",
  secret: true,
  explicitSecret: false,
  lastReceived: null,
  registered: { enabled: true, disabledReason: null, lastError: null, lastSuccessAt: null },
};
const delivered = { ...base, registered: { enabled: true, disabledReason: null, lastError: null, lastSuccessAt: "2026-10-02T08:15:30Z" } };
const flat = (s: string) => s.replace(/\s/g, " ");

describe("/setup : suivi en direct sans Upstash", () => {
  it("affiche l'heure du dernier avis livré selon Rydar Drive", () => {
    expect(flat(liveTrackingDetail(delivered))).toBe("activé · dernier avis livré selon Rydar Drive : 02/10/2026 10:15:30");
    expect(liveTrackingDetail(base)).toBe("activé · aucun avis livré pour l'instant");
    const failing = { ...base, registered: { ...delivered.registered, lastError: "HTTP 500" } };
    expect(liveTrackingDetail(failing)).toContain("dernière erreur : HTTP 500");
  });

  it("« Dernier avis reçu » : vert dès que Rydar Drive a livré un avis, même vu par une autre instance", () => {
    const line = lastNoticeLine(delivered, "memory");
    expect(line.ok).toBe(true);
    expect(flat(line.label)).toBe("Dernier avis reçu de Rydar Drive : 02/10/2026 10:15:30 (livré, selon Rydar Drive)");
    expect(line.detail).toContain("stockage en mémoire");
  });

  it("garde l'avis vu par le site s'il est plus récent, et son type", () => {
    const line = lastNoticeLine({ ...delivered, lastReceived: { at: "2026-10-02T08:20:00Z", type: "ping" } }, "redis");
    expect(line.ok).toBe(true);
    expect(line.label).toContain("(avis de test)");
    expect(line.detail).toBeUndefined();
  });

  it("aucun avis nulle part : à faire", () => {
    const line = lastNoticeLine(base, "memory");
    expect(line.ok).toBe(false);
    expect(line.label).toContain("aucun pour l'instant");
    expect(lastNoticeLine({ ...base, registered: false }, "redis").ok).toBe(false);
  });
});
