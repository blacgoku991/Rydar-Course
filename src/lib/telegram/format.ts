import { BUSINESS } from "@/config/business";
import type { VehicleId } from "@/config/pricing";
import { commissionSplit } from "@/lib/pricing";
import { formatPhoneIntl } from "@/lib/phone";
import { getKnownPlace } from "@/lib/known-places";
import { escapeHtml } from "@/lib/telegram/entities";
import type { TgInlineButton, TgUser } from "@/lib/telegram/types";
import { formatDateLong, formatMoney } from "@/lib/time";
import type { Booking } from "@/lib/types";

export const VEHICLE_LABEL_FR: Record<VehicleId, string> = {
  business: "Berline Business",
  van: "Van Premium",
  prestige: "Prestige",
};

export type CentralStatus = "new" | "taken" | "done" | "cancelled";

const KIND_ICON: Record<string, string> = { airport: "✈️", station: "🚆", landmark: "🏛", poi: "📌" };

export function userLink(u: Pick<TgUser, "id" | "first_name" | "last_name">) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Chauffeur";
  return `<a href="tg://user?id=${u.id}">${escapeHtml(name)}</a>`;
}

export function statusHeader(status: CentralStatus, actor?: TgUser): string {
  switch (status) {
    case "new":
      return "🆕 <b>NOUVELLE COURSE · À ATTRIBUER</b>";
    case "taken":
      return `✅ <b>ATTRIBUÉE</b> · ${actor ? userLink(actor) : ""}`;
    case "done":
      return `🏁 <b>TERMINÉE</b> · ${actor ? userLink(actor) : ""}`;
    case "cancelled":
      return `❌ <b>ANNULÉE</b>${actor ? ` · par ${userLink(actor)}` : ""}`;
  }
}

/** Déduit le statut depuis la première ligne du message. */
export function statusFromText(text: string): CentralStatus | null {
  const first = text.split("\n", 1)[0] ?? "";
  if (first.startsWith("🆕")) return "new";
  if (first.startsWith("✅")) return "taken";
  if (first.startsWith("🏁")) return "done";
  if (first.startsWith("❌")) return "cancelled";
  return null;
}

export function parisClock(d = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: BUSINESS.timezone, hour: "2-digit", minute: "2-digit" }).format(d);
}

function placeLine(icon: string, label: string, p: Booking["pickup"]) {
  const kindIcon = KIND_ICON[p.kind] ? `${KIND_ICON[p.kind]} ` : "";
  // Les lieux connus sont toujours affichés en français pour la centrale.
  const name = p.id.startsWith("known:") ? (getKnownPlace(p.id.slice(6))?.name.fr ?? p.label) : p.label;
  return `${icon} <b>${label}</b>  ${kindIcon}${escapeHtml(name)}`;
}

export function routeUrl(b: Booking) {
  const origin = `${b.pickup.lat},${b.pickup.lon}`;
  if (!b.dropoff) return `https://www.google.com/maps/search/?api=1&query=${origin}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${b.dropoff.lat},${b.dropoff.lon}&travelmode=driving`;
}

export function whatsappUrl(phoneE164: string) {
  return `https://wa.me/${phoneE164.replace(/[^\d]/g, "")}`;
}

export function bookingMessageHtml(b: Booking, opts: { test?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(statusHeader("new"));
  const source = b.source === "phone" ? "📞 Assistant téléphonique" : "🌐 Site web";
  lines.push(`<code>${escapeHtml(b.ref)}</code> · ${source} (${b.locale.toUpperCase()})${opts.test ? " · 🧪 <b>TEST</b>" : ""}`);
  lines.push("");
  const date = formatDateLong(b.date, "fr");
  lines.push(`🗓 <b>${escapeHtml(date.charAt(0).toUpperCase() + date.slice(1))} · ${escapeHtml(b.time)}</b> <i>(heure de Paris)</i>`);
  lines.push(placeLine("📍", "Départ", b.pickup));
  if (b.service === "hourly") {
    lines.push(`⏱ <b>Mise à disposition</b>  ${b.hours} h`);
    if (b.dropoff) lines.push(placeLine("🏁", "Fin prévue", b.dropoff));
  } else if (b.dropoff) {
    lines.push(placeLine("🏁", "Arrivée", b.dropoff));
  }
  if (b.distanceKm !== null && b.durationMin !== null) lines.push(`🛣 ${b.distanceKm.toLocaleString("fr-FR")} km · ~${b.durationMin} min`);
  lines.push("");
  const extras = [`👥 ${b.passengers}`, `🧳 ${b.luggage}`];
  if (b.childSeats > 0) extras.push(`👶 ${b.childSeats} siège${b.childSeats > 1 ? "s" : ""} enfant`);
  lines.push(`🚘 <b>${VEHICLE_LABEL_FR[b.vehicle]}</b> · ${extras.join(" · ")}`);
  if (b.flight) lines.push(`✈️ Vol / train : <b>${escapeHtml(b.flight)}</b>`);
  if (b.signName) lines.push(`🪧 Pancarte : « ${escapeHtml(b.signName)} »`);
  if (b.notes) lines.push(`📝 « ${escapeHtml(b.notes)} »`);
  lines.push("");
  if (b.priceCents === null) {
    lines.push("💶 <b>SUR DEVIS</b> — prix à communiquer au client");
  } else {
    const { commissionCents, driverCents } = commissionSplit(b.priceCents, BUSINESS.commissionPercent);
    lines.push(`💶 <b>${formatMoney(b.priceCents, "fr")}</b> TTC${b.fixed ? " (forfait)" : ""}`);
    lines.push(`   ├ Chauffeur : ${formatMoney(driverCents, "fr")}`);
    lines.push(`   └ Commission ${BUSINESS.commissionPercent} % : ${formatMoney(commissionCents, "fr")}`);
  }
  lines.push("");
  lines.push(`👤 <b>${escapeHtml(b.customer.name)}</b>`);
  lines.push(`📱 ${escapeHtml(formatPhoneIntl(b.customer.phone))}`);
  if (b.customer.email) lines.push(`✉️ ${escapeHtml(b.customer.email)}`);
  lines.push("");
  lines.push("<i>Journal</i>");
  lines.push(`• ${parisClock(new Date(b.createdAt))} Reçue (${b.source === "phone" ? "téléphone" : "site"})`);
  return lines.join("\n");
}

export interface LinkButtons {
  route?: string;
  whatsapp?: string;
}

export function linkRow(links: LinkButtons): TgInlineButton[] {
  const row: TgInlineButton[] = [];
  if (links.route) row.push({ text: "🗺 Itinéraire", url: links.route });
  if (links.whatsapp) row.push({ text: "💬 WhatsApp client", url: links.whatsapp });
  return row;
}

export function keyboardFor(status: CentralStatus | "confirm_cancel", ref: string, links: LinkButtons): { inline_keyboard: TgInlineButton[][] } {
  const cb = (action: string) => `rp:${action}:${ref}`;
  const links_ = linkRow(links);
  const rows: TgInlineButton[][] = [];
  switch (status) {
    case "new":
      rows.push([{ text: "🚘 Je prends la course", callback_data: cb("take") }]);
      if (links_.length) rows.push(links_);
      rows.push([{ text: "❌ Annuler", callback_data: cb("cancel") }]);
      break;
    case "taken":
      rows.push([
        { text: "🏁 Terminée", callback_data: cb("done") },
        { text: "↩️ Libérer", callback_data: cb("release") },
      ]);
      if (links_.length) rows.push(links_);
      rows.push([{ text: "❌ Annuler", callback_data: cb("cancel") }]);
      break;
    case "confirm_cancel":
      rows.push([
        { text: "✅ Oui, annuler la course", callback_data: cb("cancel_yes") },
        { text: "Retour", callback_data: cb("cancel_no") },
      ]);
      break;
    case "done":
      if (links_.length) rows.push(links_);
      break;
    case "cancelled":
      rows.push([{ text: "♻️ Rétablir", callback_data: cb("restore") }]);
      break;
  }
  return { inline_keyboard: rows };
}
