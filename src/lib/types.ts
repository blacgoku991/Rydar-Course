import type { VehicleId } from "@/config/pricing";

export type Locale = "fr" | "en";

export type PlaceKind = "airport" | "station" | "landmark" | "address" | "street" | "city" | "poi";

/** Lieu résolu (sérialisable, partagé client/serveur). */
export interface Place {
  id: string;
  label: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  postcode?: string;
  citycode?: string;
  city?: string;
}

export type ServiceType = "transfer" | "hourly";

export interface QuoteRequest {
  service: ServiceType;
  pickup: Place;
  dropoff?: Place | null;
  hours?: number;
  date: string; // YYYY-MM-DD (heure de Paris)
  time: string; // HH:MM (heure de Paris)
  passengers: number;
  luggage: number;
  childSeats: number;
}

export interface VehicleQuote {
  vehicle: VehicleId;
  /** Prix TTC en centimes, null si sur devis. */
  priceCents: number | null;
  available: boolean;
  unavailableReason?: "capacity";
}

export interface QuoteResult {
  service: ServiceType;
  fixed: boolean;
  quoteRequired: boolean;
  quoteRequiredReason?: "out_of_area" | "too_far";
  distanceKm: number | null;
  durationMin: number | null;
  options: VehicleQuote[];
  zones: { from: string | null; to: string | null };
}

/** Réponse de /api/quote pour le site. */
export interface QuoteResponse extends QuoteResult {
  token: string;
  expiresAt: number;
  pickup: Place;
  dropoff: Place | null;
  date: string;
  time: string;
  hours: number | null;
  passengers: number;
  luggage: number;
  childSeats: number;
}

export type BookingSource = "web" | "phone";

export type BookingStatus = "new" | "taken" | "done" | "cancelled";

export interface Booking {
  ref: string;
  createdAt: string;
  source: BookingSource;
  locale: Locale;
  service: ServiceType;
  pickup: Place;
  dropoff: Place | null;
  date: string;
  time: string;
  hours: number | null;
  passengers: number;
  luggage: number;
  childSeats: number;
  vehicle: VehicleId;
  priceCents: number | null;
  fixed: boolean;
  distanceKm: number | null;
  durationMin: number | null;
  customer: { name: string; phone: string; email?: string };
  flight?: string;
  signName?: string;
  notes?: string;
  conversationId?: string;
}
