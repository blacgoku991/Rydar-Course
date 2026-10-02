/**
 * GRILLE TARIFAIRE — modifiez ce fichier pour changer vos prix.
 * Tous les montants sont en euros TTC. Le calcul est fait côté serveur uniquement.
 *
 * Ordre de calcul :
 *  1. Forfait (fixedFares) si le départ et l'arrivée correspondent à deux zones listées.
 *  2. Sinon tarif kilométrique : prise en charge + km + minutes, avec un minimum.
 *  3. Mise à disposition : tarif horaire × nombre d'heures (minimum minHours).
 *  4. Options (sièges enfant…) ajoutées, puis arrondi.
 * Au-delà de maxDistanceKm ou hors zone desservie → "sur devis" (pas de prix inventé).
 */

export const VEHICLE_IDS = ["business", "van", "prestige"] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];

export const VEHICLES: Record<VehicleId, { passengers: number; luggage: number }> = {
  business: { passengers: 3, luggage: 3 },
  van: { passengers: 7, luggage: 7 },
  prestige: { passengers: 3, luggage: 2 },
};

type PerVehicle = Record<VehicleId, number>;

export interface FixedFare {
  /** Identifiants de zones (voir src/config/zones.ts). Le forfait s'applique dans les deux sens. */
  a: string;
  b: string;
  prices: PerVehicle;
}

export const PRICING = {
  /** Arrondi du prix final à l'euro supérieur (mettre 5 pour arrondir aux 5 €). */
  roundTo: 1,

  fixedFares: [
    { a: "paris", b: "cdg", prices: { business: 75, van: 95, prestige: 150 } },
    { a: "paris", b: "orly", prices: { business: 60, van: 80, prestige: 130 } },
    { a: "paris", b: "beauvais", prices: { business: 140, van: 170, prestige: 260 } },
    { a: "paris", b: "disney", prices: { business: 95, van: 115, prestige: 180 } },
    { a: "paris", b: "versailles", prices: { business: 70, van: 90, prestige: 140 } },
    { a: "paris", b: "lbg", prices: { business: 65, van: 85, prestige: 130 } },
    { a: "cdg", b: "orly", prices: { business: 95, van: 120, prestige: 180 } },
    { a: "cdg", b: "disney", prices: { business: 80, van: 100, prestige: 160 } },
    { a: "orly", b: "disney", prices: { business: 95, van: 120, prestige: 180 } },
  ] satisfies FixedFare[],

  perKm: {
    business: { base: 12, perKm: 1.9, perMinute: 0.45, minimum: 50 },
    van: { base: 18, perKm: 2.4, perMinute: 0.55, minimum: 70 },
    prestige: { base: 30, perKm: 3.4, perMinute: 0.8, minimum: 110 },
  } satisfies Record<VehicleId, { base: number; perKm: number; perMinute: number; minimum: number }>,

  hourly: {
    rates: { business: 65, van: 80, prestige: 120 } satisfies PerVehicle,
    minHours: 2,
    maxHours: 12,
    /** Kilomètres inclus par heure de mise à disposition (information affichée). */
    includedKmPerHour: 25,
  },

  /** Majoration de nuit (en %) appliquée au tarif kilométrique uniquement. 0 = désactivée. */
  night: { percent: 0, start: "22:00", end: "06:00" },

  options: {
    /** Prix par siège enfant / rehausseur. */
    childSeat: 10,
    maxChildSeats: 3,
  },

  /** Au-delà, le trajet passe "sur devis". */
  maxDistanceKm: 800,
};

/**
 * ZONE DESSERVIE — au moins le départ OU l'arrivée doit être dans un de ces départements.
 * Ajoutez un département quand vous avez réellement des chauffeurs sur place.
 */
export const SERVICE_AREA = {
  departments: ["75", "77", "78", "91", "92", "93", "94", "95", "60"],
};
