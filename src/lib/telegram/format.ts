import { BUSINESS } from "@/config/business";
import type { VehicleId } from "@/config/pricing";
import { getKnownPlace } from "@/lib/known-places";
import { formatPhoneIntl } from "@/lib/phone";
import { commissionSplit } from "@/lib/pricing";
import type { Ride } from "@/lib/rides";
import { escapeHtml } from "@/lib/telegram/entities";
import type { TgInlineButton } from "@/lib/telegram/types";
import { addDays, formatDateLong, formatMoney, nowInZone } from "@/lib/time";
import type { Booking, Place } from "@/lib/types";

/**
 * Trois messages par course :
 *  - groupe chauffeurs : fiche ultra courte + bouton « Je prends » (aucune info client) ;
 *  - chauffeur (en privé, après avoir pris) : coordonnées complètes ;
 *  - admin (chat privé de la centrale) : prix client, commission, historique.
 */

export const VEHICLE_LABEL_FR: Record<VehicleId, string> = {
  business: "Berline Business",
  van: "Van Premium",
  prestige: "Prestige",
};

/** Code court affiché dans le groupe (comme « IMMEDIAT B »). */
export const VEHICLE_CODE: Record<VehicleId, string> = { business: "B", van: "VAN", prestige: "PRESTIGE" };

const SHORT_KNOWN: Record<string, string> = {
  "ory-123": "ORLY 1-2-3",
  "ory-4": "ORLY 4",
  bva: "BEAUVAIS",
  lbg: "LE BOURGET",
  "cdg-tgv": "GARE CDG TGV",
  "chessy-tgv": "GARE CHESSY TGV",
  "massy-tgv": "GARE MASSY TGV",
  disneyland: "DISNEYLAND",
  "versailles-chateau": "CHÂTEAU DE VERSAILLES",
  "la-defense": "LA DÉFENSE",
};

/** « ANTONY », « PARIS 8E », « CDG T2E », « GARE SAINT-LAZARE »… */
export function shortPlace(p: Place): string {
  if (p.id.startsWith("known:")) {
    const id = p.id.slice(6);
    if (id.startsWith("cdg-") && id !== "cdg-tgv") return `CDG T${id.slice(4).toUpperCase()}`;
    if (SHORT_KNOWN[id]) return SHORT_KNOWN[id];
    const known = getKnownPlace(id);
    if (known)
      return known.name.fr
        .replace(/, Paris$/, "")
        .replace(/\s*\(.*?\)/g, "")
        .toUpperCase();
  }
  if (p.postcode?.startsWith("75")) {
    const arr = Number(p.postcode.slice(3)) || (p.postcode === "75116" ? 16 : 0);
    if (arr >= 1 && arr <= 20) return `PARIS ${arr}${arr === 1 ? "ER" : "E"}`;
    return "PARIS";
  }
  const city = p.city || /\d{5}\s+([^,]+)/.exec(p.label)?.[1];
  if (city) return city.trim().toUpperCase();
  return p.label.split(",")[0].slice(0, 32).toUpperCase();
}

const DAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];

/** « AUJ. », « DEMAIN » ou « SAM 05/10 ». */
export function shortDate(date: string, now = new Date()) {
  const today = nowInZone(now).date;
  if (date === today) return "AUJ.";
  if (date === addDays(today, 1)) return "DEMAIN";
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[wd]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function parisClock(d = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: BUSINESS.timezone, hour: "2-digit", minute: "2-digit" }).format(d);
}

export function driverShareCents(b: Booking) {
  return b.priceCents === null ? null : commissionSplit(b.priceCents, BUSINESS.commissionPercent).driverCents;
}

function routeLine(b: Booking) {
  const from = shortPlace(b.pickup);
  if (b.service === "hourly") return `${from} ➜ MAD ${b.hours}H`;
  return `${from} ➜ ${b.dropoff ? shortPlace(b.dropoff) : "?"}`;
}

function headLine(b: Booking) {
  return `${shortDate(b.date)} · ${b.time} · ${VEHICLE_CODE[b.vehicle]}`;
}

function extrasLine(b: Booking) {
  const parts = [`👥${b.passengers}`, `🧳${b.luggage}`];
  if (b.childSeats) parts.push(`👶${b.childSeats}`);
  if (b.flight) parts.push(`✈️ ${escapeHtml(b.flight)}`);
  return parts.join("  ");
}

function money(cents: number | null) {
  return cents === null ? "SUR DEVIS" : formatMoney(cents, "fr");
}

/* ------------------------------ Groupe ------------------------------ */

export function groupText(ride: Ride): string {
  const b = ride.booking;
  const test = ride.test ? "🧪 TEST · " : "";
  const summary = `${escapeHtml(headLine(b))}  ${escapeHtml(routeLine(b))}`;
  switch (ride.status) {
    case "open":
      return [
        `${test}<b>${escapeHtml(headLine(b))}</b>`,
        "",
        `<b>${escapeHtml(routeLine(b))}</b>`,
        "",
        extrasLine(b),
        `💶 <b>${money(driverShareCents(b))}</b>`,
        "",
        `<code>${b.ref}</code>`,
      ].join("\n");
    case "taken":
      return `✅ <s>${summary}</s>\nPrise par <b>${escapeHtml(ride.driver?.name ?? "?")}</b> · <code>${b.ref}</code>`;
    case "done":
      return `🏁 <s>${summary}</s>\nTerminée · ${escapeHtml(ride.driver?.name ?? "")} · <code>${b.ref}</code>`;
    case "cancelled":
      return `❌ <s>${summary}</s>\nAnnulée · <code>${b.ref}</code>`;
  }
}

export function groupKeyboard(ride: Ride) {
  return ride.status === "open" ? { inline_keyboard: [[{ text: "✋ JE PRENDS", callback_data: `rp:take:${ride.booking.ref}` }]] } : { inline_keyboard: [] };
}

/* ----------------------------- Chauffeur ----------------------------- */

export function routeUrl(b: Booking) {
  const origin = `${b.pickup.lat},${b.pickup.lon}`;
  if (!b.dropoff) return `https://www.google.com/maps/search/?api=1&query=${origin}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${b.dropoff.lat},${b.dropoff.lon}&travelmode=driving`;
}

export function whatsappUrl(phoneE164: string) {
  return `https://wa.me/${phoneE164.replace(/[^\d]/g, "")}`;
}

function frName(p: Place) {
  return p.id.startsWith("known:") ? (getKnownPlace(p.id.slice(6))?.name.fr ?? p.label) : p.label;
}

function capitalized(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function driverText(ride: Ride): string {
  const b = ride.booking;
  const head =
    ride.status === "taken"
      ? `✅ <b>COURSE ${b.ref} — À TOI</b>`
      : ride.status === "done"
        ? `🏁 <b>COURSE ${b.ref} — TERMINÉE</b>`
        : ride.status === "cancelled"
          ? `❌ <b>COURSE ${b.ref} — ANNULÉE PAR LA CENTRALE</b>`
          : `↩️ <b>COURSE ${b.ref} — LIBÉRÉE</b>`;
  const lines = [head, "", `📅 <b>${escapeHtml(capitalized(formatDateLong(b.date, "fr")))} · ${b.time}</b>`, `📍 ${escapeHtml(frName(b.pickup))}`];
  if (b.service === "hourly") lines.push(`⏱ Mise à disposition ${b.hours} h`);
  if (b.dropoff) lines.push(`🏁 ${escapeHtml(frName(b.dropoff))}`);
  lines.push(`🚘 ${VEHICLE_LABEL_FR[b.vehicle]}  ${extrasLine(b)}`);
  if (b.signName) lines.push(`🪧 Pancarte : « ${escapeHtml(b.signName)} »`);
  if (b.notes) lines.push(`📝 ${escapeHtml(b.notes)}`);
  lines.push("", `💶 Ta part : <b>${money(driverShareCents(b))}</b>`);
  if (ride.status === "taken") lines.push("", `👤 <b>${escapeHtml(b.customer.name)}</b>`, `📱 ${escapeHtml(formatPhoneIntl(b.customer.phone))}`);
  return lines.join("\n");
}

export function driverKeyboard(ride: Ride) {
  const b = ride.booking;
  if (ride.status !== "taken") return { inline_keyboard: [] as TgInlineButton[][] };
  return {
    inline_keyboard: [
      [
        { text: "🗺 Itinéraire", url: routeUrl(b) },
        { text: "💬 WhatsApp client", url: whatsappUrl(b.customer.phone) },
      ],
      [
        { text: "🏁 Course terminée", callback_data: `rp:done:${b.ref}` },
        { text: "↩️ Libérer", callback_data: `rp:rel:${b.ref}` },
      ],
    ],
  };
}

/* ------------------------------- Admin ------------------------------- */

const ADMIN_STATUS: Record<Ride["status"], string> = {
  open: "🟡 EN ATTENTE DE CHAUFFEUR",
  taken: "🟢 ATTRIBUÉE",
  done: "🏁 TERMINÉE",
  cancelled: "❌ ANNULÉE",
};

export function adminText(ride: Ride): string {
  const b = ride.booking;
  const source = b.source === "phone" ? "📞 Téléphone IA" : b.source === "voice" ? "🎙️ Assistant vocal (site)" : "🌐 Site";
  const lines = [
    `${ADMIN_STATUS[ride.status]}${ride.driver && ride.status !== "open" ? ` · ${escapeHtml(ride.driver.name)}${ride.driver.username ? ` (@${escapeHtml(ride.driver.username)})` : ""}` : ""}`,
    `<code>${b.ref}</code> · ${source} (${b.locale.toUpperCase()})${ride.test ? " · 🧪 TEST" : ""}`,
    "",
    `📅 ${escapeHtml(capitalized(formatDateLong(b.date, "fr")))} · <b>${b.time}</b>`,
    `📍 ${escapeHtml(frName(b.pickup))}`,
  ];
  if (b.service === "hourly") lines.push(`⏱ Mise à disposition ${b.hours} h`);
  if (b.dropoff) lines.push(`🏁 ${escapeHtml(frName(b.dropoff))}`);
  if (b.distanceKm !== null && b.durationMin !== null && b.service === "transfer")
    lines.push(`🛣 ${b.distanceKm.toLocaleString("fr-FR")} km · ~${b.durationMin} min`);
  lines.push(`🚘 ${VEHICLE_LABEL_FR[b.vehicle]}  ${extrasLine(b)}`);
  if (b.signName) lines.push(`🪧 « ${escapeHtml(b.signName)} »`);
  if (b.notes) lines.push(`📝 ${escapeHtml(b.notes)}`);
  lines.push("");
  if (b.priceCents === null) lines.push("💶 <b>SUR DEVIS</b> — prix à fixer avec le client");
  else {
    const { commissionCents, driverCents } = commissionSplit(b.priceCents, BUSINESS.commissionPercent);
    lines.push(
      `💶 Client : <b>${formatMoney(b.priceCents, "fr")}</b>${b.fixed ? " (forfait)" : ""}`,
      `🚘 Chauffeur : ${formatMoney(driverCents, "fr")}`,
      `💰 Commission ${BUSINESS.commissionPercent} % : <b>${formatMoney(commissionCents, "fr")}</b>`,
    );
  }
  lines.push("", `👤 ${escapeHtml(b.customer.name)} · 📱 ${escapeHtml(formatPhoneIntl(b.customer.phone))}`);
  if (b.customer.email) lines.push(`✉️ ${escapeHtml(b.customer.email)}`);
  lines.push("", "<i>Historique</i>");
  for (const l of ride.log.slice(-12)) lines.push(`• ${parisClock(new Date(l.at))} ${escapeHtml(l.text)}`);
  return lines.join("\n");
}

export function adminKeyboard(ride: Ride, confirmCancel = false) {
  const ref = ride.booking.ref;
  if (confirmCancel) {
    return {
      inline_keyboard: [
        [
          { text: "✅ Oui, annuler", callback_data: `rp:cancel_yes:${ref}` },
          { text: "Retour", callback_data: `rp:cancel_no:${ref}` },
        ],
      ],
    };
  }
  const rows: TgInlineButton[][] = [[{ text: "💬 WhatsApp client", url: whatsappUrl(ride.booking.customer.phone) }]];
  if (ride.status === "open") rows.push([{ text: "❌ Annuler", callback_data: `rp:cancel:${ref}` }]);
  if (ride.status === "taken")
    rows.push([
      { text: "♻️ Remettre en ligne", callback_data: `rp:reopen:${ref}` },
      { text: "❌ Annuler", callback_data: `rp:cancel:${ref}` },
    ]);
  if (ride.status === "cancelled") rows.push([{ text: "♻️ Remettre en ligne", callback_data: `rp:reopen:${ref}` }]);
  return { inline_keyboard: rows };
}
