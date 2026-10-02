/**
 * Lieux connus (aéroports, gares, sites) proposés en priorité dans la recherche
 * d'adresse du site et reconnus par l'assistant téléphonique.
 * `aliases` : mots-clés de recherche (sans accents, minuscules).
 */
export type PlaceKind = "airport" | "station" | "landmark";

export interface KnownPlace {
  id: string;
  kind: PlaceKind;
  name: { fr: string; en: string };
  lat: number;
  lon: number;
  postcode: string;
  citycode: string;
  city: string;
  aliases: string[];
  /** Mis en avant quand le champ est vide. */
  popular?: boolean;
}

const cdg = (terminal: string, lat: number, lon: number, extra: string[] = [], popular = false): KnownPlace => ({
  id: `cdg-${terminal.toLowerCase()}`,
  kind: "airport",
  name: {
    fr: `Aéroport Paris-Charles de Gaulle (CDG) — Terminal ${terminal}`,
    en: `Paris-Charles de Gaulle Airport (CDG) — Terminal ${terminal}`,
  },
  lat,
  lon,
  postcode: "95700",
  citycode: "95527",
  city: "Roissy-en-France",
  aliases: ["cdg", "charles de gaulle", "roissy", "aeroport", "airport", `terminal ${terminal.toLowerCase()}`, `t${terminal.toLowerCase()}`, ...extra],
  popular,
});

export const KNOWN_PLACES: KnownPlace[] = [
  cdg("1", 49.0146, 2.5419, [], true),
  cdg("2A", 49.0043, 2.5717),
  cdg("2B", 49.0051, 2.5689),
  cdg("2C", 49.0039, 2.5741),
  cdg("2D", 49.0047, 2.5665),
  cdg("2E", 49.0046, 2.5839, [], true),
  cdg("2F", 49.0063, 2.5786, [], true),
  cdg("2G", 49.0097, 2.5965),
  cdg("3", 49.0128, 2.5486),
  {
    id: "ory-123",
    kind: "airport",
    name: { fr: "Aéroport Paris-Orly (ORY) — Orly 1, 2, 3", en: "Paris-Orly Airport (ORY) — Orly 1, 2, 3" },
    lat: 48.7289,
    lon: 2.3597,
    postcode: "94390",
    citycode: "94054",
    city: "Orly",
    aliases: ["orly", "ory", "aeroport", "airport", "orly 1", "orly 2", "orly 3", "terminal 1", "terminal 2", "terminal 3"],
    popular: true,
  },
  {
    id: "ory-4",
    kind: "airport",
    name: { fr: "Aéroport Paris-Orly (ORY) — Orly 4", en: "Paris-Orly Airport (ORY) — Orly 4" },
    lat: 48.7249,
    lon: 2.3607,
    postcode: "94390",
    citycode: "94054",
    city: "Orly",
    aliases: ["orly", "ory", "aeroport", "airport", "orly 4", "terminal 4"],
    popular: true,
  },
  {
    id: "bva",
    kind: "airport",
    name: { fr: "Aéroport de Beauvais-Tillé (BVA)", en: "Beauvais-Tillé Airport (BVA)" },
    lat: 49.4544,
    lon: 2.1128,
    postcode: "60000",
    citycode: "60639",
    city: "Tillé",
    aliases: ["beauvais", "bva", "tille", "aeroport", "airport"],
  },
  {
    id: "lbg",
    kind: "airport",
    name: { fr: "Aéroport de Paris-Le Bourget (LBG)", en: "Paris-Le Bourget Airport (LBG)" },
    lat: 48.9694,
    lon: 2.4414,
    postcode: "93350",
    citycode: "93013",
    city: "Le Bourget",
    aliases: ["bourget", "le bourget", "lbg", "aviation d'affaires", "jet", "aeroport", "airport"],
  },
  station("gare-du-nord", "Gare du Nord", "Gare du Nord station", 48.8809, 2.3553, "75010", "75110", ["nord", "eurostar", "thalys"], true),
  station("gare-de-lyon", "Gare de Lyon", "Gare de Lyon station", 48.8443, 2.3743, "75012", "75112", ["lyon"], true),
  station("gare-montparnasse", "Gare Montparnasse", "Montparnasse station", 48.8412, 2.3201, "75015", "75115", ["montparnasse"], true),
  station("gare-de-l-est", "Gare de l'Est", "Gare de l'Est station", 48.8768, 2.3592, "75010", "75110", ["est"]),
  station("gare-saint-lazare", "Gare Saint-Lazare", "Saint-Lazare station", 48.8763, 2.3253, "75008", "75108", ["saint lazare", "st lazare", "lazare"]),
  station("gare-d-austerlitz", "Gare d'Austerlitz", "Austerlitz station", 48.842, 2.3655, "75013", "75113", ["austerlitz"]),
  station("gare-de-bercy", "Gare de Bercy", "Bercy station", 48.839, 2.3826, "75012", "75112", ["bercy"]),
  {
    id: "cdg-tgv",
    kind: "station",
    name: { fr: "Gare Aéroport CDG 2 TGV", en: "CDG Airport 2 TGV station" },
    lat: 49.0039,
    lon: 2.5713,
    postcode: "95700",
    citycode: "95527",
    city: "Roissy-en-France",
    aliases: ["gare", "station", "tgv", "cdg", "roissy", "charles de gaulle"],
  },
  {
    id: "chessy-tgv",
    kind: "station",
    name: { fr: "Gare Marne-la-Vallée – Chessy (TGV)", en: "Marne-la-Vallée – Chessy station (TGV)" },
    lat: 48.8701,
    lon: 2.7828,
    postcode: "77700",
    citycode: "77111",
    city: "Chessy",
    aliases: ["gare", "station", "tgv", "chessy", "marne la vallee", "disney"],
  },
  {
    id: "massy-tgv",
    kind: "station",
    name: { fr: "Gare de Massy TGV", en: "Massy TGV station" },
    lat: 48.7256,
    lon: 2.2605,
    postcode: "91300",
    citycode: "91377",
    city: "Massy",
    aliases: ["gare", "station", "tgv", "massy"],
  },
  {
    id: "disneyland",
    kind: "landmark",
    name: { fr: "Disneyland Paris", en: "Disneyland Paris" },
    lat: 48.8722,
    lon: 2.7758,
    postcode: "77700",
    citycode: "77111",
    city: "Chessy",
    aliases: ["disney", "disneyland", "parc", "marne la vallee"],
  },
  {
    id: "versailles-chateau",
    kind: "landmark",
    name: { fr: "Château de Versailles", en: "Palace of Versailles" },
    lat: 48.8049,
    lon: 2.1204,
    postcode: "78000",
    citycode: "78646",
    city: "Versailles",
    aliases: ["versailles", "chateau", "palace"],
  },
  {
    id: "la-defense",
    kind: "landmark",
    name: { fr: "La Défense — Grande Arche", en: "La Défense — Grande Arche" },
    lat: 48.8925,
    lon: 2.236,
    postcode: "92800",
    citycode: "92062",
    city: "Puteaux",
    aliases: ["defense", "la defense", "grande arche", "cnit"],
  },
  airport("nce", "Aéroport Nice Côte d'Azur (NCE)", "Nice Côte d'Azur Airport (NCE)", 43.6584, 7.2159, "06200", "06088", "Nice", [
    "nice",
    "nce",
    "cote d'azur",
  ]),
  airport("lys", "Aéroport Lyon-Saint Exupéry (LYS)", "Lyon-Saint Exupéry Airport (LYS)", 45.7256, 5.0811, "69125", "69299", "Colombier-Saugnieu", [
    "lyon",
    "lys",
    "saint exupery",
    "st exupery",
  ]),
  airport("mrs", "Aéroport Marseille Provence (MRS)", "Marseille Provence Airport (MRS)", 43.4393, 5.2214, "13700", "13054", "Marignane", [
    "marseille",
    "mrs",
    "marignane",
    "provence",
  ]),
  airport("bod", "Aéroport de Bordeaux-Mérignac (BOD)", "Bordeaux-Mérignac Airport (BOD)", 44.8283, -0.7156, "33700", "33281", "Mérignac", [
    "bordeaux",
    "bod",
    "merignac",
  ]),
  airport("tls", "Aéroport Toulouse-Blagnac (TLS)", "Toulouse-Blagnac Airport (TLS)", 43.6293, 1.3638, "31700", "31069", "Blagnac", [
    "toulouse",
    "tls",
    "blagnac",
  ]),
  airport("nte", "Aéroport Nantes Atlantique (NTE)", "Nantes Atlantique Airport (NTE)", 47.1532, -1.6107, "44340", "44020", "Bouguenais", [
    "nantes",
    "nte",
    "atlantique",
  ]),
];

function station(
  id: string,
  fr: string,
  en: string,
  lat: number,
  lon: number,
  postcode: string,
  citycode: string,
  aliases: string[],
  popular = false,
): KnownPlace {
  return {
    id,
    kind: "station",
    name: { fr: `${fr}, Paris`, en: `${en}, Paris` },
    lat,
    lon,
    postcode,
    citycode,
    city: "Paris",
    aliases: ["gare", "station", "train", "sncf", ...aliases],
    popular,
  };
}

function airport(
  id: string,
  fr: string,
  en: string,
  lat: number,
  lon: number,
  postcode: string,
  citycode: string,
  city: string,
  aliases: string[],
): KnownPlace {
  return { id, kind: "airport", name: { fr, en }, lat, lon, postcode, citycode, city, aliases: ["aeroport", "airport", ...aliases] };
}
