/**
 * Textes du suivi en direct (avis Rydar Drive) sur /setup. Sans dépendance au navigateur : testés à part.
 */

export type DriveWebhookStatus = {
  url: string;
  secret: boolean;
  explicitSecret: boolean;
  lastReceived: { at: string; type: string } | null;
  /** null = clé API absente ; false = pas encore inscrit chez Rydar Drive. */
  registered: null | false | { enabled: boolean; disabledReason: string | null; lastError: string | null; lastSuccessAt: string | null };
  error?: string;
};

export const DRIVE_EVENT_FR: Record<string, string> = {
  ping: "avis de test",
  "ride.created": "course créée",
  "ride.accepted": "chauffeur attribué",
  "ride.driver_unassigned": "chauffeur retiré",
  "ride.driver_en_route": "chauffeur en route",
  "ride.driver_arrived": "chauffeur sur place",
  "ride.passenger_onboard": "client à bord",
  "ride.in_progress": "en course",
  "ride.completed": "course terminée",
  "ride.cancelled": "course annulée",
  "ride.no_driver_found": "aucun chauffeur trouvé",
  "ride.rescheduled": "heure modifiée",
};

export function parisTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "medium" }).format(d);
}

export function liveTrackingDetail(w: DriveWebhookStatus) {
  if (w.error) return w.error;
  if (w.registered === null) return "ajoutez d'abord la clé API Rydar Drive";
  if (w.registered === false) return "non activé : cliquez sur « Activer le suivi en direct »";
  if (!w.registered.enabled)
    return `désactivé par Rydar Drive${w.registered.disabledReason ? ` (${w.registered.disabledReason})` : ""} : cliquez sur « Activer le suivi en direct » pour le réactiver`;
  const delivered = w.registered.lastSuccessAt
    ? ` · dernier avis livré selon Rydar Drive : ${parisTime(w.registered.lastSuccessAt)}`
    : " · aucun avis livré pour l'instant";
  return `activé${delivered}${w.registered.lastError ? ` · dernière erreur : ${w.registered.lastError}` : ""}`;
}

/**
 * Ligne « Dernier avis reçu » : le dernier avis vu par le site, ou à défaut (ou s'il est plus récent) le dernier avis
 * livré selon Rydar Drive, qui fait foi. Sans Upstash, le site ne voit que les avis reçus par l'instance qui l'affiche.
 */
export function lastNoticeLine(w: DriveWebhookStatus, store: "redis" | "memory"): { ok: boolean; label: string; detail?: string } {
  const delivered = w.registered ? w.registered.lastSuccessAt : null;
  const received = w.lastReceived;
  const memory = store === "memory" ? "stockage en mémoire : le site ne voit que les avis reçus par cette instance (ajoutez Upstash Redis)" : undefined;
  const useDelivered = !!delivered && (!received || Date.parse(delivered) > Date.parse(received.at));
  if (useDelivered) {
    return {
      ok: true,
      label: `Dernier avis reçu de Rydar Drive : ${parisTime(delivered!)} (livré, selon Rydar Drive)`,
      detail: memory,
    };
  }
  if (received) {
    return {
      ok: true,
      label: `Dernier avis reçu de Rydar Drive : ${parisTime(received.at)} (${DRIVE_EVENT_FR[received.type] ?? received.type})`,
      detail: memory,
    };
  }
  return { ok: false, label: "Dernier avis reçu de Rydar Drive : aucun pour l'instant", detail: memory };
}
