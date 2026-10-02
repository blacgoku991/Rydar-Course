import "server-only";
import { BUSINESS } from "@/config/business";
import { DRIVE_FINAL, DRIVE_STATUS_FR, driveDriverLabel, type DriveRide } from "@/lib/drive";
import { logLine, type Ride, type RideStatus } from "@/lib/rides";

/**
 * Synchronisation d'une course avec Rydar Drive, commune au bouton « 🔄 Actualiser » (lecture GET /rides/{id})
 * et aux avis en direct (webhooks, POST /api/drive/webhook). Fonctions pures : ni écriture, ni message.
 *
 * Correspondance des statuts (fiche admin, /courses) :
 *  - COMPLETED → done ; CANCELLED → cancelled (définitifs : plus aucun retour en arrière) ;
 *  - chauffeur sur la course (ACCEPTED → IN_PROGRESS) → taken ;
 *  - sans chauffeur (CREATED, SEARCHING_DRIVER, OFFERED) → open, y compris après un désistement ;
 *  - NO_DRIVER_FOUND → open : la course n'est ni faite ni annulée, la centrale peut relancer la recherche
 *    ou l'annuler (l'admin reçoit une alerte, et la fiche affiche « ⚠️ Aucun chauffeur trouvé »).
 */

const WAITING = new Set(["CREATED", "SEARCHING_DRIVER", "OFFERED", "NO_DRIVER_FOUND"]);
const ASSIGNED = new Set(["ACCEPTED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_ONBOARD", "IN_PROGRESS"]);

/** Statut local correspondant au statut Rydar Drive ; null = statut inconnu, statut local inchangé. */
export function localStatusOf(driveStatus: string): RideStatus | null {
  if (driveStatus === "COMPLETED") return "done";
  if (driveStatus === "CANCELLED") return "cancelled";
  if (ASSIGNED.has(driveStatus)) return "taken";
  if (WAITING.has(driveStatus)) return "open";
  return null;
}

function instant(iso?: string | null) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** « sam. 10/10 09:30 » (heure de Paris). */
function parisDateTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: BUSINESS.timezone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Applique un instantané Rydar Drive à la course. Retourne la course modifiée, ou null s'il n'y a rien à écrire :
 * course non liée à ce trajet Rydar Drive, instantané plus ancien que le dernier appliqué (avis en double ou arrivés
 * dans le désordre), course déjà terminée/annulée, ou aucun changement.
 */
export function mergeDriveRide(ride: Ride, remote: DriveRide): Ride | null {
  const d = ride.drive;
  if (!d || remote.id !== d.id || typeof remote.status !== "string" || !remote.status) return null;
  const at = instant(remote.updated_at);
  const known = instant(d.updatedAt);
  if (at !== null && known !== null && at < known) return null;
  if (DRIVE_FINAL.has(d.status) && remote.status !== d.status) return null;

  const r = structuredClone(ride);
  const next = r.drive!;
  const status = remote.status;
  let changed = false;

  if (status !== d.status) {
    // Annulation demandée depuis la fiche admin : l'avis de Rydar Drive peut arriver avant la fin de l'action.
    r.log.push(logLine(status === "CANCELLED" && d.cancelBy ? `❌ Annulée par ${d.cancelBy}` : `Rydar Drive : ${DRIVE_STATUS_FR[status] ?? status}`));
    next.status = status;
    changed = true;
  }

  // Le chauffeur reste affiché sur une course terminée ou annulée (historique).
  const driver = driveDriverLabel(remote) ?? (DRIVE_FINAL.has(status) ? d.driver : undefined);
  if (driver !== d.driver) {
    if (driver) {
      r.log.push(logLine(`👤 ${driver}`));
      next.driver = driver;
    } else {
      r.log.push(logLine(`↩️ ${d.driver} n'est plus sur la course`));
      delete next.driver;
    }
    changed = true;
  }

  const pickup = instant(remote.pickup_at);
  if (pickup !== null && pickup !== instant(d.pickupAt)) {
    // Changement d'heure signalé seulement par rapport à une heure déjà connue de Rydar Drive.
    if (d.pickupAt && !DRIVE_FINAL.has(status)) r.log.push(logLine(`🕒 Prise en charge déplacée : ${parisDateTime(remote.pickup_at!)}`));
    next.pickupAt = remote.pickup_at!;
    changed = true;
  }

  if (typeof remote.number === "number" && remote.number !== d.number) {
    next.number = remote.number;
    changed = true;
  }
  if (at !== null && at !== known) {
    next.updatedAt = remote.updated_at!;
    changed = true;
  }

  const local = localStatusOf(status);
  if (local && local !== r.status) {
    r.status = local;
    changed = true;
  }
  return changed ? r : null;
}

export type DriveAlert = "no_driver" | "cancelled";

/**
 * Alerte admin à envoyer après une mise à jour : la course vient de passer en « aucun chauffeur trouvé » (action
 * requise), ou a été annulée côté Rydar Drive sans que l'annulation vienne de RYDAR Privé (notre annulation est déjà
 * dans l'historique). Fondée sur la transition réellement appliquée : un avis en double n'alerte pas deux fois.
 */
export function driveAlertKind(before: Ride, after: Ride): DriveAlert | null {
  const was = before.drive?.status;
  const now = after.drive?.status;
  if (!now || was === now) return null;
  if (now === "NO_DRIVER_FOUND") return "no_driver";
  if (now === "CANCELLED" && !before.drive?.cancelBy && before.status !== "cancelled") return "cancelled";
  return null;
}
