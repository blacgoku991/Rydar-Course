import { BUSINESS } from "@/config/business";
import { KNOWN_PLACES } from "@/config/places";
import { PRICING, VEHICLES, VEHICLE_IDS } from "@/config/pricing";
import type { BookingConfig, BookingPrefill, VehicleInfo } from "@/components/booking/BookingWidget";
import type BookingWidget from "@/components/booking/BookingWidget";
import { getDictionary } from "@/i18n";
import { pathFor } from "@/i18n/routes";
import { VEHICLE_TEXT } from "@/i18n/vehicles";
import { knownToPlace, popularPlaces } from "@/lib/known-places";
import type { Locale } from "@/lib/types";
import type { ComponentProps } from "react";

export function vehiclesFor(locale: Locale): VehicleInfo[] {
  return VEHICLE_IDS.map((id) => ({ id, ...VEHICLE_TEXT[locale][id], ...VEHICLES[id] }));
}

export function bookingConfig(locale: Locale): BookingConfig {
  return {
    minLeadMinutes: BUSINESS.minLeadMinutes,
    quoteValidityMinutes: BUSINESS.quoteValidityMinutes,
    maxChildSeats: PRICING.options.maxChildSeats,
    minHours: PRICING.hourly.minHours,
    maxHours: PRICING.hourly.maxHours,
    phoneDisplay: BUSINESS.phoneDisplay,
    phoneHref: BUSINESS.phoneHref,
    termsHref: pathFor("terms", locale),
    privacyHref: pathFor("privacy", locale),
  };
}

/** Props du formulaire de réservation pour une langue donnée. */
export function widgetProps(locale: Locale, initial?: BookingPrefill, headingLevel: "h2" | "h3" = "h2"): ComponentProps<typeof BookingWidget> {
  const dict = getDictionary(locale);
  return {
    locale,
    t: dict.booking,
    errors: dict.errors,
    vehicles: vehiclesFor(locale),
    known: KNOWN_PLACES.map((p) => knownToPlace(p, locale)),
    popular: popularPlaces(locale),
    initial,
    config: bookingConfig(locale),
    headingLevel,
  };
}
