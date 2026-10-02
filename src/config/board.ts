/**
 * Lignes du tableau des départs (page d'accueil). Les prix viennent de la grille
 * (forfait berline), les durées sont indicatives.
 */
export const BOARD_ROUTES = [
  { a: "paris", b: "cdg", code: "CDG", label: { fr: "Paris → Roissy CDG", en: "Paris → CDG Airport" }, minutes: 45, prefill: { dropoffQuery: "CDG" } },
  { a: "paris", b: "orly", code: "ORY", label: { fr: "Paris → Orly", en: "Paris → Orly Airport" }, minutes: 35, prefill: { dropoffQuery: "Orly" } },
  { a: "paris", b: "beauvais", code: "BVA", label: { fr: "Paris → Beauvais", en: "Paris → Beauvais Airport" }, minutes: 75, prefill: { dropoffId: "bva" } },
  { a: "paris", b: "disney", code: "DLP", label: { fr: "Paris → Disneyland", en: "Paris → Disneyland" }, minutes: 50, prefill: { dropoffId: "disneyland" } },
  {
    a: "paris",
    b: "versailles",
    code: "VRS",
    label: { fr: "Paris → Versailles", en: "Paris → Versailles" },
    minutes: 40,
    prefill: { dropoffId: "versailles-chateau" },
  },
  {
    a: "cdg",
    b: "orly",
    code: "C·O",
    label: { fr: "Roissy CDG → Orly", en: "CDG → Orly" },
    minutes: 55,
    prefill: { pickupQuery: "CDG", dropoffQuery: "Orly" },
  },
] as const;
