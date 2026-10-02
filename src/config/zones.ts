/**
 * Zones utilisées pour les forfaits. Une adresse appartient à une zone si :
 *  - elle est dans le rayon (radiusKm) autour du point (aéroports, sites), ou
 *  - son code postal / code INSEE correspond (villes).
 * Les zones à rayon sont testées en premier.
 */
export interface Zone {
  id: string;
  name: { fr: string; en: string };
  center?: { lat: number; lon: number };
  radiusKm?: number;
  postcodePrefixes?: string[];
  citycodes?: string[];
  /** Contrôle de cohérence : les coordonnées doivent être à moins de maxKm de ce point. */
  bounds?: { lat: number; lon: number; maxKm: number };
}

export const ZONES: Zone[] = [
  { id: "cdg", name: { fr: "Aéroport Paris-CDG", en: "Paris-CDG Airport" }, center: { lat: 49.0097, lon: 2.5479 }, radiusKm: 4.5 },
  { id: "orly", name: { fr: "Aéroport Paris-Orly", en: "Paris-Orly Airport" }, center: { lat: 48.7262, lon: 2.3652 }, radiusKm: 3.5 },
  { id: "beauvais", name: { fr: "Aéroport de Beauvais", en: "Beauvais Airport" }, center: { lat: 49.4544, lon: 2.1128 }, radiusKm: 2.5 },
  { id: "lbg", name: { fr: "Aéroport du Bourget", en: "Le Bourget Airport" }, center: { lat: 48.9694, lon: 2.4414 }, radiusKm: 2 },
  { id: "disney", name: { fr: "Disneyland Paris", en: "Disneyland Paris" }, center: { lat: 48.8716, lon: 2.7794 }, radiusKm: 3.2 },
  { id: "paris", name: { fr: "Paris", en: "Paris" }, postcodePrefixes: ["75"], citycodes: ["75056"], bounds: { lat: 48.8566, lon: 2.3522, maxKm: 9 } },
  {
    id: "versailles",
    name: { fr: "Versailles", en: "Versailles" },
    citycodes: ["78646"],
    postcodePrefixes: ["78000"],
    bounds: { lat: 48.8049, lon: 2.1204, maxKm: 6 },
  },
];
