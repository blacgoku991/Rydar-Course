/**
 * Informations de l'entreprise affichées sur le site, dans les messages Telegram
 * et utilisées par l'assistant téléphonique.
 *
 * Les valeurs NEXT_PUBLIC_* se règlent dans les variables d'environnement
 * (Vercel → Settings → Environment Variables) puis nécessitent un redéploiement.
 */

function digits(value: string) {
  return value.replace(/[^\d+]/g, "");
}

const phoneDisplay = process.env.NEXT_PUBLIC_PHONE_DISPLAY || process.env.NEXT_PUBLIC_PHONE || "";
const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP || "";

export const BUSINESS = {
  brand: "RYDAR Privé",
  wordmark: "RYDAR",
  submark: "PRIVÉ",
  /** Numéro affiché sur le site (celui de l'assistant vocal / standard). */
  phoneDisplay,
  phoneHref: phoneDisplay ? `tel:${digits(phoneDisplay)}` : "",
  email: process.env.NEXT_PUBLIC_EMAIL || "",
  whatsappHref: whatsapp ? `https://wa.me/${digits(whatsapp).replace(/^\+/, "")}` : "",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  timezone: "Europe/Paris",
  currency: "EUR",
  /** Commission de la centrale, en % du prix client TTC (affichée uniquement dans Telegram). */
  commissionPercent: clampNumber(process.env.COMMISSION_PERCENT, 20, 0, 90),
  /** Délai minimum entre la réservation et la prise en charge. */
  minLeadMinutes: clampNumber(process.env.MIN_LEAD_MINUTES, 120, 0, 7 * 24 * 60),
  /** Réservation possible jusqu'à N jours à l'avance. */
  maxAdvanceDays: 365,
  /** Durée de validité d'un devis (prix garanti) en minutes. */
  quoteValidityMinutes: 45,
  /** Temps d'attente offert, affiché sur le site. À ajuster selon vos accords chauffeurs. */
  freeWaitingAirportMinutes: 60,
  freeWaitingOtherMinutes: 15,
} as const;

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Informations légales (pages Mentions légales / CGV / Confidentialité).
 * Renseignez-les via les variables d'environnement ; "[à compléter]" s'affiche sinon.
 */
export const LEGAL = {
  companyName: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  legalForm: process.env.NEXT_PUBLIC_LEGAL_FORM || "",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  siren: process.env.NEXT_PUBLIC_LEGAL_SIREN || "",
  vat: process.env.NEXT_PUBLIC_LEGAL_VAT || "",
  director: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR || "",
  /** Numéro d'enregistrement / déclaration de centrale de réservation (registre VTC). */
  registration: process.env.NEXT_PUBLIC_LEGAL_REGISTRATION || "",
  insurer: process.env.NEXT_PUBLIC_LEGAL_INSURER || "",
  mediator: process.env.NEXT_PUBLIC_LEGAL_MEDIATOR || "",
  host: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com",
  /** Conditions d'annulation affichées dans les CGV (à valider). */
  freeCancellationHours: 24,
  lateCancellationPercent: 50,
  noShowPercent: 100,
  callRetentionDays: Number(process.env.CALL_RETENTION_DAYS) > 0 ? Number(process.env.CALL_RETENTION_DAYS) : 90,
};
