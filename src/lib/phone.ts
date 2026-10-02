import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Normalise un numéro (E.164). Les numéros sans indicatif sont considérés français. */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/^00/, "+");
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, "FR");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhoneIntl(e164: string) {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}
