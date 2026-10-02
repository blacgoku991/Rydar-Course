import { BUSINESS } from "@/config/business";
import type { Locale } from "@/lib/types";

const TZ = BUSINESS.timezone;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateString(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isTimeString(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s);
}

function partsInZone(utcMs: number, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}

function offsetMinutes(utcMs: number, tz: string) {
  const p = partsInZone(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * Convertit une date/heure locale (Paris) en instant UTC.
 * Retourne null si l'heure n'existe pas (passage à l'heure d'été).
 */
export function zonedToUtc(date: string, time: string, tz: string = TZ): Date | null {
  if (!isDateString(date) || !isTimeString(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMinutes(guess - 0, tz);
  let utc = guess - off1 * 60000;
  const off2 = offsetMinutes(utc, tz);
  if (off2 !== off1) utc = guess - off2 * 60000;
  const check = partsInZone(utc, tz);
  if (check.year !== y || check.month !== m || check.day !== d || check.hour !== hh || check.minute !== mm) return null;
  return new Date(utc);
}

/** Date et heure actuelles à Paris. */
export function nowInZone(now: Date = new Date(), tz: string = TZ) {
  const p = partsInZone(now.getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export type PickupTimeError = "invalid" | "nonexistent" | "past" | "too_soon" | "too_far";

export function checkPickupTime(date: string, time: string, now: Date = new Date()): { ok: true; at: Date } | { ok: false; error: PickupTimeError } {
  if (!isDateString(date) || !isTimeString(time)) return { ok: false, error: "invalid" };
  const at = zonedToUtc(date, time);
  if (!at) return { ok: false, error: "nonexistent" };
  const diffMin = (at.getTime() - now.getTime()) / 60000;
  if (diffMin < 0) return { ok: false, error: "past" };
  if (diffMin < BUSINESS.minLeadMinutes) return { ok: false, error: "too_soon" };
  if (diffMin > BUSINESS.maxAdvanceDays * 24 * 60) return { ok: false, error: "too_far" };
  return { ok: true, at };
}

const LOCALE_TAG: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

/** "samedi 5 octobre 2026" / "Saturday 5 October 2026" */
export function formatDateLong(date: string, locale: Locale) {
  if (!isDateString(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "sam. 5 oct." / "Sat 5 Oct" */
export function formatDateShort(date: string, locale: Locale) {
  if (!isDateString(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMoney(cents: number, locale: Locale) {
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function minutesOfDay(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
