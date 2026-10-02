import { normalizeText } from "@/lib/geo";
import { addDays, isDateString, nowInZone } from "@/lib/time";

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  fev: 2,
  mar: 3,
  apr: 4,
  avr: 4,
  jun: 6,
  jul: 7,
  juil: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Prochaine occurrence d'une date jour/mois (cette année ou l'an prochain). */
function nextDayMonth(day: number, month: number, today: string, year?: number) {
  const y0 = year ?? Number(today.slice(0, 4));
  const candidate = `${y0}-${pad(month)}-${pad(day)}`;
  if (!isDateString(candidate)) return null;
  if (!year && candidate < today) {
    const next = `${y0 + 1}-${pad(month)}-${pad(day)}`;
    return isDateString(next) ? next : null;
  }
  return candidate;
}

/**
 * Comprend une date donnée au téléphone : "2026-10-05", "05/10", "demain",
 * "vendredi", "le 5 octobre", "October 5th"… Retourne YYYY-MM-DD (heure de Paris) ou null.
 */
export function parseSpokenDate(input: string, now: Date = new Date()): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const today = nowInZone(now).date;
  if (isDateString(raw)) return raw;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) {
    const d = `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
    return isDateString(d) ? d : null;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(raw);
  if (dmy) {
    const year = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : undefined;
    return nextDayMonth(Number(dmy[1]), Number(dmy[2]), today, year);
  }

  const t = normalizeText(raw);
  if (/\b(aujourd ?hui|today|ce soir|tonight|this evening|ce matin|this morning|cet apres midi|this afternoon)\b/.test(t)) return today;
  if (/\b(apres demain|day after tomorrow)\b/.test(t)) return addDays(today, 2);
  if (/\b(demain|tomorrow)\b/.test(t)) return addDays(today, 1);

  const tokens = t.split(" ");
  // "5 octobre 2026", "le 5 octobre", "october 5th 2026", "5th of october"
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  for (const tok of tokens) {
    const num = /^(\d{1,4})(?:st|nd|rd|th|er|e)?$/.exec(tok);
    if (num) {
      const n = Number(num[1]);
      if (n >= 1000) year = n;
      else if (n >= 1 && n <= 31 && day === undefined) day = n;
      continue;
    }
    if (tok === "premier" || tok === "first") day ??= 1;
    if (MONTHS[tok] !== undefined) month = MONTHS[tok];
  }
  if (day !== undefined && month !== undefined) return nextDayMonth(day, month, today, year);

  for (const tok of tokens) {
    if (WEEKDAYS[tok] !== undefined) {
      const target = WEEKDAYS[tok];
      let delta = (target - weekdayOf(today) + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(today, delta);
    }
  }
  return null;
}

/** "14:30", "14h30", "14h", "2:30 pm", "2 pm", "midi", "noon"… → "HH:MM" ou null. */
export function parseSpokenTime(input: string): string | null {
  const t = normalizeText(input ?? "").replace(/\s+/g, " ");
  if (!t) return null;
  if (/\b(midi|noon)\b/.test(t)) return "12:00";
  if (/\b(minuit|midnight)\b/.test(t)) return "00:00";
  const m = /(\d{1,2})(?:\s*(?:h|:|heures?|hours?)\s*(\d{1,2})?|\s+(\d{2}))?\s*(am|pm|du matin|de l apres midi|du soir)?/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  const suffix = m[4];
  if (suffix === "pm" || suffix === "de l apres midi" || suffix === "du soir") {
    if (h < 12) h += 12;
  } else if ((suffix === "am" || suffix === "du matin") && h === 12) {
    h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
