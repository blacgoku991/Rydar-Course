import type { VehicleId } from "@/config/pricing";
import type { Locale } from "@/lib/types";

export const VEHICLE_TEXT: Record<Locale, Record<VehicleId, { name: string; models: string; tagline: string }>> = {
  fr: {
    business: { name: "Berline Business", models: "Mercedes Classe E, BMW Série 5 ou similaire", tagline: "L'essentiel, impeccablement exécuté." },
    van: { name: "Van Premium", models: "Mercedes Classe V ou similaire", tagline: "Familles, équipes, bagages : tout le monde à bord." },
    prestige: { name: "Prestige", models: "Mercedes Classe S, BMW Série 7 ou similaire", tagline: "Le silence d'un salon privé." },
  },
  en: {
    business: { name: "Business Sedan", models: "Mercedes E-Class, BMW 5 Series or similar", tagline: "The essentials, impeccably delivered." },
    van: { name: "Premium Van", models: "Mercedes V-Class or similar", tagline: "Families, teams, luggage: everyone on board." },
    prestige: { name: "Prestige", models: "Mercedes S-Class, BMW 7 Series or similar", tagline: "The quiet of a private lounge." },
  },
};
