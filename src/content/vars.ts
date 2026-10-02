import { BUSINESS, LEGAL } from "@/config/business";
import { PRICING } from "@/config/pricing";
import { fill } from "@/i18n";
import { fixedFareFrom } from "@/lib/pricing";
import { formatMoney } from "@/lib/time";
import type { Locale } from "@/lib/types";

const TODO: Record<Locale, string> = { fr: "[à compléter]", en: "[to be completed]" };

/** Valeurs injectées dans les textes ({from}, {wait}, {company}…). */
export function contentVars(locale: Locale, fare?: { a: string; b: string }) {
  const prices = fare ? fixedFareFrom(fare.a, fare.b) : null;
  const money = (euros: number) => formatMoney(euros * 100, locale);
  const or = (v: string) => v || TODO[locale];
  return {
    from: prices ? money(prices.business) : "",
    van: prices ? money(prices.van) : "",
    prestige: prices ? money(prices.prestige) : "",
    wait: BUSINESS.freeWaitingAirportMinutes,
    waitOther: BUSINESS.freeWaitingOtherMinutes,
    hourly: money(PRICING.hourly.rates.business),
    minHours: PRICING.hourly.minHours,
    kmPerHour: PRICING.hourly.includedKmPerHour,
    lead: BUSINESS.minLeadMinutes,
    company: or(LEGAL.companyName),
    legalForm: or(LEGAL.legalForm),
    address: or(LEGAL.address),
    siren: or(LEGAL.siren),
    vat: or(LEGAL.vat),
    director: or(LEGAL.director),
    registration: or(LEGAL.registration),
    insurer: or(LEGAL.insurer),
    mediator: or(LEGAL.mediator),
    host: LEGAL.host,
    email: or(BUSINESS.email),
    phone: or(BUSINESS.phoneDisplay),
    freeCancel: LEGAL.freeCancellationHours,
    lateCancel: LEGAL.lateCancellationPercent,
    noShow: LEGAL.noShowPercent,
    retention: LEGAL.callRetentionDays,
  };
}

export function fillVars(text: string, vars: ReturnType<typeof contentVars>) {
  return fill(text, vars);
}
