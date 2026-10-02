import type { PageKey } from "@/i18n/routes";
import type { Locale } from "@/lib/types";

/**
 * Contenu des pages de service (SEO) et des pages légales.
 * Variables remplacées automatiquement depuis la configuration :
 *   {from} {van} {prestige}  → forfaits de la page (berline / van / prestige)
 *   {wait} {waitOther}       → minutes d'attente offertes
 *   {hourly} {minHours}      → tarif horaire berline, durée minimum
 *   {kmPerHour}              → km inclus par heure
 *   {lead}                   → délai minimum de réservation (minutes)
 */

export interface Section {
  h2: string;
  body?: string[];
  bullets?: string[];
}

export interface ServicePage {
  kind: "service";
  nav: string;
  title: string;
  description: string;
  kicker: string;
  h1: string;
  h1Em: string;
  intro: string;
  /** Forfaits affichés (paires de zones). */
  fares?: { a: string; b: string; label: string }[];
  prefill: { dropoffId?: string; pickupId?: string; dropoffQuery?: string; mode?: "transfer" | "hourly" };
  serviceType: string;
  sections: Section[];
  faq: { q: string; a: string }[];
}

export interface LegalPage {
  kind: "legal";
  nav: string;
  title: string;
  description: string;
  h1: string;
  sections: Section[];
}

export type PageContent = ServicePage | LegalPage;

const CONTENT: Record<PageKey, Record<Locale, PageContent>> = {
  cdg: {
    fr: {
      kind: "service",
      nav: "Transfert aéroport CDG",
      title: "Transfert aéroport CDG Roissy — Chauffeur privé Paris ↔ Charles de Gaulle",
      description:
        "Chauffeur privé entre Paris et l'aéroport Charles de Gaulle (CDG) : forfait fixe dès {from} TTC, accueil avec pancarte, vol suivi, terminaux 1, 2 et 3. Réservation en ligne ou par téléphone.",
      kicker: "Aéroport Paris-Charles de Gaulle",
      h1: "Transfert aéroport",
      h1Em: "Paris — Roissy CDG",
      intro:
        "Un chauffeur privé vous attend à votre adresse parisienne ou dans le hall d'arrivée de Roissy-Charles de Gaulle. Forfait fixe à partir de {from}, quel que soit le trafic.",
      fares: [{ a: "paris", b: "cdg", label: "Paris ↔ Aéroport CDG" }],
      prefill: { dropoffQuery: "CDG" },
      serviceType: "Transfert aéroport",
      sections: [
        {
          h2: "Votre arrivée à Roissy, sans attente",
          bullets: [
            "Votre numéro de vol est transmis au chauffeur, qui adapte l'heure de prise en charge en cas d'avance ou de retard.",
            "Accueil dans le hall d'arrivée, avec une pancarte à votre nom sur demande.",
            "{wait} minutes d'attente offertes après l'atterrissage, le temps de récupérer vos bagages.",
            "Aide pour les bagages jusqu'au véhicule, puis trajet direct vers votre adresse.",
          ],
        },
        {
          h2: "Tous les terminaux de Charles de Gaulle",
          body: [
            "Terminal 1, terminal 2 (de 2A à 2G) et terminal 3 : choisissez votre terminal au moment de réserver. Si vous ne le connaissez pas encore, indiquez simplement votre numéro de vol.",
            "La gare Aéroport CDG 2 TGV est également desservie, pour vos correspondances train et avion.",
          ],
        },
        {
          h2: "Vers l'aéroport : partez à l'heure",
          body: [
            "Depuis le centre de Paris, le trajet dure généralement de 45 minutes à une heure, davantage aux heures de pointe. Pour un vol international, nous vous conseillons une prise en charge environ trois heures avant le décollage.",
            "Le prix du forfait est le même dans les deux sens et ne dépend pas des embouteillages.",
          ],
        },
      ],
      faq: [
        {
          q: "Combien coûte un transfert Paris – CDG ?",
          a: "Le forfait entre Paris intra-muros et l'aéroport Charles de Gaulle est de {from} en berline business, {van} en van et {prestige} en classe Prestige, TTC, dans les deux sens.",
        },
        { q: "Combien de temps dure le trajet ?", a: "Comptez généralement 45 minutes à une heure depuis le centre de Paris, plus aux heures de pointe." },
        {
          q: "Que se passe-t-il si mon vol est retardé ?",
          a: "Le chauffeur suit votre vol grâce au numéro indiqué à la réservation et adapte son arrivée. L'attente est offerte pendant {wait} minutes après l'atterrissage.",
        },
        {
          q: "Je pars d'une autre ville d'Île-de-France, est-ce possible ?",
          a: "Oui. Le prix est alors calculé selon la distance et la durée du trajet, et s'affiche immédiatement dans le formulaire.",
        },
      ],
    },
    en: {
      kind: "service",
      nav: "CDG airport transfer",
      title: "CDG Airport Transfer — Private chauffeur Paris ↔ Charles de Gaulle",
      description:
        "Private chauffeur between Paris and Charles de Gaulle Airport (CDG): flat rate from {from} all taxes included, meet & greet, flight tracking, terminals 1, 2 and 3. Book online or by phone.",
      kicker: "Paris-Charles de Gaulle Airport",
      h1: "Airport transfer",
      h1Em: "Paris — CDG Roissy",
      intro:
        "A private chauffeur waits for you at your Paris address or in the arrivals hall at Charles de Gaulle. Flat rate from {from}, whatever the traffic.",
      fares: [{ a: "paris", b: "cdg", label: "Paris ↔ CDG Airport" }],
      prefill: { dropoffQuery: "CDG" },
      serviceType: "Airport transfer",
      sections: [
        {
          h2: "Arrive at CDG, no waiting",
          bullets: [
            "Your flight number is shared with your chauffeur, who adjusts the pickup time if you land early or late.",
            "Meet & greet in the arrivals hall, with a name sign on request.",
            "{wait} minutes of free waiting time after landing, to collect your luggage.",
            "Help with your luggage to the car, then straight to your address.",
          ],
        },
        {
          h2: "Every Charles de Gaulle terminal",
          body: [
            "Terminal 1, terminal 2 (2A to 2G) and terminal 3: choose your terminal when booking. If you don't know it yet, just give us your flight number.",
            "The CDG Airport 2 TGV station is also served, for your train and plane connections.",
          ],
        },
        {
          h2: "To the airport: leave on time",
          body: [
            "From central Paris the journey usually takes 45 minutes to one hour, longer at rush hour. For an international flight, we recommend a pickup about three hours before take-off.",
            "The flat rate is the same in both directions and does not depend on traffic.",
          ],
        },
      ],
      faq: [
        {
          q: "How much is a Paris – CDG transfer?",
          a: "The flat rate between central Paris and Charles de Gaulle Airport is {from} in a business sedan, {van} in a van and {prestige} in Prestige class, all taxes included, in both directions.",
        },
        { q: "How long does the journey take?", a: "Usually 45 minutes to one hour from central Paris, longer at rush hour." },
        {
          q: "What if my flight is delayed?",
          a: "Your chauffeur follows your flight using the number given at booking and adjusts their arrival. Waiting is free for {wait} minutes after landing.",
        },
        {
          q: "I'm leaving from another town in Île-de-France, is that possible?",
          a: "Yes. The price is then calculated on the distance and duration of the journey, and shown instantly in the booking form.",
        },
      ],
    },
  },
  orly: {
    fr: {
      kind: "service",
      nav: "Transfert aéroport Orly",
      title: "Transfert aéroport Orly — Chauffeur privé Paris ↔ Orly 1, 2, 3, 4",
      description:
        "Chauffeur privé entre Paris et l'aéroport d'Orly : forfait fixe dès {from} TTC, accueil personnalisé, vol suivi, Orly 1 à 4. Réservation en ligne ou par téléphone, en français et en anglais.",
      kicker: "Aéroport Paris-Orly",
      h1: "Transfert aéroport",
      h1Em: "Paris — Orly",
      intro: "Le trajet le plus court vers vos vols au sud de Paris, avec un chauffeur privé et un forfait fixe à partir de {from}.",
      fares: [{ a: "paris", b: "orly", label: "Paris ↔ Aéroport d'Orly" }],
      prefill: { dropoffQuery: "Orly" },
      serviceType: "Transfert aéroport",
      sections: [
        {
          h2: "Orly 1, 2, 3 et Orly 4",
          body: [
            "Les terminaux Orly 1, 2 et 3 sont regroupés dans un même bâtiment, Orly 4 se trouve à quelques minutes à pied. Indiquez votre terminal ou votre numéro de vol : votre chauffeur vous attend au bon endroit.",
          ],
        },
        {
          h2: "Une arrivée en douceur",
          bullets: [
            "Vol suivi grâce au numéro communiqué à la réservation.",
            "Accueil personnalisé dans le hall d'arrivée, pancarte à votre nom sur demande.",
            "{wait} minutes d'attente offertes après l'atterrissage.",
            "Sièges enfant disponibles sur demande.",
          ],
        },
        {
          h2: "Un forfait clair",
          body: [
            "Depuis Paris, le trajet vers Orly dure généralement 30 à 45 minutes. Le forfait est identique dans les deux sens et ne varie pas avec la circulation.",
          ],
        },
      ],
      faq: [
        {
          q: "Combien coûte un transfert Paris – Orly ?",
          a: "Le forfait entre Paris intra-muros et l'aéroport d'Orly est de {from} en berline business, {van} en van et {prestige} en classe Prestige, TTC.",
        },
        {
          q: "Combien de temps faut-il pour rejoindre Orly ?",
          a: "Généralement 30 à 45 minutes depuis le centre de Paris, selon l'heure et le point de départ.",
        },
        {
          q: "Puis-je réserver un transfert Orly – CDG ?",
          a: "Oui, un forfait existe aussi entre les deux aéroports parisiens. Il s'affiche automatiquement dans le formulaire.",
        },
      ],
    },
    en: {
      kind: "service",
      nav: "Orly airport transfer",
      title: "Orly Airport Transfer — Private chauffeur Paris ↔ Orly 1, 2, 3, 4",
      description:
        "Private chauffeur between Paris and Orly Airport: flat rate from {from} all taxes included, personal welcome, flight tracking, Orly 1 to 4. Book online or by phone, in English and French.",
      kicker: "Paris-Orly Airport",
      h1: "Airport transfer",
      h1Em: "Paris — Orly",
      intro: "The quickest way to your flights south of Paris, with a private chauffeur and a flat rate from {from}.",
      fares: [{ a: "paris", b: "orly", label: "Paris ↔ Orly Airport" }],
      prefill: { dropoffQuery: "Orly" },
      serviceType: "Airport transfer",
      sections: [
        {
          h2: "Orly 1, 2, 3 and Orly 4",
          body: [
            "Orly 1, 2 and 3 share the same building, and Orly 4 is a few minutes' walk away. Give us your terminal or flight number: your chauffeur waits for you at the right place.",
          ],
        },
        {
          h2: "A smooth arrival",
          bullets: [
            "Flight tracked using the number given at booking.",
            "Personal welcome in the arrivals hall, name sign on request.",
            "{wait} minutes of free waiting time after landing.",
            "Child seats available on request.",
          ],
        },
        {
          h2: "A clear flat rate",
          body: [
            "From Paris, the journey to Orly usually takes 30 to 45 minutes. The flat rate is the same in both directions and does not change with traffic.",
          ],
        },
      ],
      faq: [
        {
          q: "How much is a Paris – Orly transfer?",
          a: "The flat rate between central Paris and Orly Airport is {from} in a business sedan, {van} in a van and {prestige} in Prestige class, all taxes included.",
        },
        { q: "How long does it take to get to Orly?", a: "Usually 30 to 45 minutes from central Paris, depending on the time and your starting point." },
        {
          q: "Can I book an Orly – CDG transfer?",
          a: "Yes, there is also a flat rate between the two Paris airports. It appears automatically in the booking form.",
        },
      ],
    },
  },
  chauffeur: {
    fr: {
      kind: "service",
      nav: "Chauffeur privé Paris",
      title: "Chauffeur privé à Paris — VTC haut de gamme sur réservation",
      description:
        "Réservez un chauffeur privé à Paris et en Île-de-France : berline business, van ou classe Prestige, prix fixé à la réservation, chauffeurs professionnels. En ligne ou par téléphone.",
      kicker: "Paris & Île-de-France",
      h1: "Chauffeur privé",
      h1Em: "à Paris",
      intro:
        "Rendez-vous d'affaires, dîner, gare, hôtel ou soirée : un chauffeur professionnel vous conduit d'une adresse à l'autre, avec un prix connu avant de partir.",
      fares: [
        { a: "paris", b: "cdg", label: "Paris ↔ Aéroport CDG" },
        { a: "paris", b: "orly", label: "Paris ↔ Aéroport d'Orly" },
        { a: "paris", b: "beauvais", label: "Paris ↔ Aéroport de Beauvais" },
        { a: "paris", b: "disney", label: "Paris ↔ Disneyland Paris" },
        { a: "paris", b: "versailles", label: "Paris ↔ Versailles" },
      ],
      prefill: {},
      serviceType: "Chauffeur privé",
      sections: [
        {
          h2: "Un trajet, un prix",
          body: [
            "Le tarif de votre course est calculé dès la réservation selon la distance et la durée estimées, avec un minimum de course. Il ne change pas en route : pas de compteur, pas de surprise.",
            "Les trajets les plus demandés, vers les aéroports, Disneyland Paris ou Versailles, bénéficient d'un forfait fixe.",
          ],
        },
        {
          h2: "Trois classes de véhicules",
          bullets: [
            "Berline Business, jusqu'à 3 passagers : l'essentiel, impeccablement exécuté.",
            "Van Premium, jusqu'à 7 passagers et 7 bagages : idéal pour les familles et les équipes.",
            "Prestige, jusqu'à 3 passagers : le confort d'une grande berline pour les occasions qui comptent.",
          ],
        },
        {
          h2: "Gares parisiennes",
          body: [
            "Gare du Nord, Gare de l'Est, Gare de Lyon, Montparnasse, Saint-Lazare, Austerlitz et Bercy : indiquez votre numéro de train, votre chauffeur vous attend à l'arrivée.",
          ],
        },
      ],
      faq: [
        {
          q: "Puis-je réserver à la dernière minute ?",
          a: "La réservation en ligne est possible jusqu'à {lead} minutes avant la prise en charge. Pour un départ plus rapide, appelez la centrale.",
        },
        {
          q: "Les chauffeurs parlent-ils anglais ?",
          a: "La réservation se fait en français ou en anglais. Précisez la langue souhaitée dans les remarques pour le chauffeur.",
        },
        {
          q: "Puis-je ajouter un arrêt ?",
          a: "Oui, indiquez-le dans les précisions pour le chauffeur : la centrale vous confirme le tarif ajusté le cas échéant.",
        },
      ],
    },
    en: {
      kind: "service",
      nav: "Private chauffeur Paris",
      title: "Private Chauffeur in Paris — Premium car service on booking",
      description:
        "Book a private chauffeur in Paris and Île-de-France: business sedan, van or Prestige class, price fixed at booking, professional chauffeurs. Online or by phone.",
      kicker: "Paris & Île-de-France",
      h1: "Private chauffeur",
      h1Em: "in Paris",
      intro:
        "Business meetings, dinners, stations, hotels or evenings out: a professional chauffeur drives you door to door, with a price known before you leave.",
      fares: [
        { a: "paris", b: "cdg", label: "Paris ↔ CDG Airport" },
        { a: "paris", b: "orly", label: "Paris ↔ Orly Airport" },
        { a: "paris", b: "beauvais", label: "Paris ↔ Beauvais Airport" },
        { a: "paris", b: "disney", label: "Paris ↔ Disneyland Paris" },
        { a: "paris", b: "versailles", label: "Paris ↔ Versailles" },
      ],
      prefill: {},
      serviceType: "Private chauffeur",
      sections: [
        {
          h2: "One journey, one price",
          body: [
            "Your fare is calculated at booking from the estimated distance and duration, with a minimum fare. It does not change on the way: no meter, no surprise.",
            "The most popular journeys, to the airports, Disneyland Paris or Versailles, have a flat rate.",
          ],
        },
        {
          h2: "Three vehicle classes",
          bullets: [
            "Business Sedan, up to 3 passengers: the essentials, impeccably delivered.",
            "Premium Van, up to 7 passengers and 7 suitcases: ideal for families and teams.",
            "Prestige, up to 3 passengers: the comfort of a flagship sedan for the moments that matter.",
          ],
        },
        {
          h2: "Paris train stations",
          body: [
            "Gare du Nord, Gare de l'Est, Gare de Lyon, Montparnasse, Saint-Lazare, Austerlitz and Bercy: give us your train number and your chauffeur will be waiting on arrival.",
          ],
        },
      ],
      faq: [
        {
          q: "Can I book at the last minute?",
          a: "Online booking is available up to {lead} minutes before pickup. For a faster departure, call our dispatch team.",
        },
        {
          q: "Do the chauffeurs speak English?",
          a: "Bookings are handled in English or French. Mention your preferred language in the notes for your chauffeur.",
        },
        { q: "Can I add a stop?", a: "Yes, add it in the notes for your chauffeur: our dispatch team will confirm any price adjustment." },
      ],
    },
  },
  hourly: {
    fr: {
      kind: "service",
      nav: "Chauffeur à disposition",
      title: "Chauffeur avec mise à disposition à Paris — À l'heure",
      description:
        "Un chauffeur privé à votre disposition à Paris, à partir de {minHours} heures : rendez-vous, shopping, événements, visites. Dès {hourly} de l'heure TTC en berline business.",
      kicker: "Mise à disposition",
      h1: "Un chauffeur",
      h1Em: "à votre disposition",
      intro:
        "Votre chauffeur reste avec vous le temps qu'il faut : il vous dépose, vous attend et vous conduit au rendez-vous suivant. À partir de {hourly} de l'heure.",
      prefill: { mode: "hourly" },
      serviceType: "Mise à disposition de chauffeur",
      sections: [
        {
          h2: "Pour qui, pour quoi ?",
          bullets: [
            "Journées de rendez-vous professionnels et roadshows.",
            "Shopping, défilés, salons et événements.",
            "Visites de Paris, de Versailles ou des environs.",
            "Mariages, soirées et occasions particulières.",
          ],
        },
        {
          h2: "Un tarif horaire simple",
          body: [
            "La mise à disposition se réserve à partir de {minHours} heures, au tarif horaire de la catégorie choisie. {kmPerHour} km sont inclus par heure réservée ; la centrale vous informe à l'avance de tout dépassement.",
            "Indiquez votre programme dans les précisions pour le chauffeur : adresses, horaires, arrêts prévus.",
          ],
        },
      ],
      faq: [
        { q: "Quelle est la durée minimum ?", a: "La mise à disposition se réserve à partir de {minHours} heures." },
        { q: "Puis-je prolonger sur place ?", a: "Oui, selon la disponibilité du chauffeur. Le temps supplémentaire est facturé au même tarif horaire." },
        {
          q: "Le chauffeur peut-il sortir de Paris ?",
          a: "Oui, la mise à disposition couvre Paris et l'Île-de-France. Pour un programme plus lointain, précisez-le dans votre demande.",
        },
      ],
    },
    en: {
      kind: "service",
      nav: "Hourly chauffeur",
      title: "Hourly Chauffeur Service in Paris — Chauffeur at your disposal",
      description:
        "A private chauffeur at your disposal in Paris, from {minHours} hours: meetings, shopping, events, sightseeing. From {hourly} per hour, all taxes included, in a business sedan.",
      kicker: "By the hour",
      h1: "A chauffeur",
      h1Em: "at your disposal",
      intro: "Your chauffeur stays with you as long as you need: drops you off, waits, and drives you to your next appointment. From {hourly} per hour.",
      prefill: { mode: "hourly" },
      serviceType: "Hourly chauffeur service",
      sections: [
        {
          h2: "For whom, for what?",
          bullets: [
            "Days of business meetings and roadshows.",
            "Shopping, fashion shows, trade fairs and events.",
            "Sightseeing in Paris, Versailles and around.",
            "Weddings, evenings and special occasions.",
          ],
        },
        {
          h2: "A simple hourly rate",
          body: [
            "Hourly service is booked from {minHours} hours, at the hourly rate of the chosen class. {kmPerHour} km are included per booked hour; our dispatch team tells you in advance about any excess.",
            "Share your schedule in the notes for your chauffeur: addresses, times, planned stops.",
          ],
        },
      ],
      faq: [
        { q: "What is the minimum duration?", a: "Hourly service is booked from {minHours} hours." },
        { q: "Can I extend on the day?", a: "Yes, subject to your chauffeur's availability. Extra time is charged at the same hourly rate." },
        { q: "Can the chauffeur leave Paris?", a: "Yes, hourly service covers Paris and Île-de-France. For a longer trip, mention it in your request." },
      ],
    },
  },
  legal: {
    fr: {
      kind: "legal",
      nav: "Mentions légales",
      title: "Mentions légales",
      description: "Mentions légales du site RYDAR Privé.",
      h1: "Mentions légales",
      sections: [
        {
          h2: "Éditeur du site",
          bullets: [
            "Raison sociale : {company}",
            "Forme juridique : {legalForm}",
            "Siège social : {address}",
            "SIREN : {siren}",
            "TVA intracommunautaire : {vat}",
            "Directeur de la publication : {director}",
            "Contact : {email} · {phone}",
          ],
        },
        {
          h2: "Activité",
          body: [
            "RYDAR Privé est une centrale de réservation de voitures de transport avec chauffeur (VTC). Les prestations de transport sont réalisées par des chauffeurs professionnels partenaires, titulaires de la carte professionnelle VTC.",
            "Enregistrement / déclaration de centrale de réservation : {registration}. Assurance responsabilité civile professionnelle : {insurer}.",
          ],
        },
        { h2: "Hébergement", body: ["{host}"] },
        {
          h2: "Propriété intellectuelle",
          body: [
            "L'ensemble des contenus du site (textes, logo, illustrations, mise en page) est protégé. Toute reproduction sans autorisation est interdite.",
          ],
        },
        {
          h2: "Polices de caractères",
          body: ["Bodoni Moda et Manrope sont distribuées sous licence SIL Open Font License 1.1."],
        },
      ],
    },
    en: {
      kind: "legal",
      nav: "Legal notice",
      title: "Legal notice",
      description: "Legal notice of the RYDAR Privé website.",
      h1: "Legal notice",
      sections: [
        {
          h2: "Publisher",
          bullets: [
            "Company name: {company}",
            "Legal form: {legalForm}",
            "Registered office: {address}",
            "SIREN: {siren}",
            "VAT number: {vat}",
            "Publication director: {director}",
            "Contact: {email} · {phone}",
          ],
        },
        {
          h2: "Activity",
          body: [
            "RYDAR Privé is a booking platform for chauffeur-driven vehicles (VTC). Transport services are performed by professional partner chauffeurs holding the VTC professional card.",
            "Booking platform registration / declaration: {registration}. Professional liability insurance: {insurer}.",
          ],
        },
        { h2: "Hosting", body: ["{host}"] },
        {
          h2: "Intellectual property",
          body: ["All content on this website (text, logo, illustrations, layout) is protected. Any reproduction without permission is prohibited."],
        },
        { h2: "Fonts", body: ["Bodoni Moda and Manrope are distributed under the SIL Open Font License 1.1."] },
      ],
    },
  },
  terms: {
    fr: {
      kind: "legal",
      nav: "Conditions générales",
      title: "Conditions générales de vente",
      description: "Conditions générales de vente et d'utilisation du service de réservation RYDAR Privé.",
      h1: "Conditions générales",
      sections: [
        {
          h2: "1. Objet",
          body: [
            "Les présentes conditions régissent les réservations de trajets avec chauffeur effectuées auprès de RYDAR Privé ({company}) sur le site, par téléphone ou par tout autre canal.",
          ],
        },
        {
          h2: "2. Rôle de RYDAR Privé",
          body: [
            "RYDAR Privé agit en qualité de centrale de réservation : elle reçoit votre demande, la transmet à un chauffeur VTC professionnel partenaire et vous confirme la prise en charge. Le transport est exécuté par le chauffeur partenaire.",
          ],
        },
        {
          h2: "3. Réservation et confirmation",
          body: [
            "Le formulaire en ligne et l'assistant téléphonique enregistrent une demande de réservation. La réservation devient ferme lorsque la centrale vous la confirme (par téléphone, SMS ou message). Une référence (RP-…) vous est attribuée.",
            "Les réservations doivent être effectuées au moins {lead} minutes avant l'heure de prise en charge.",
          ],
        },
        {
          h2: "4. Prix",
          body: [
            "Les prix sont indiqués en euros, toutes taxes comprises. Ils sont fixés au moment de la réservation, soit sous forme de forfait, soit en fonction de la distance et de la durée estimées. Le prix affiché est garanti pendant la durée indiquée lors de la réservation.",
            "Peuvent donner lieu à un supplément, communiqué au client : une modification du trajet, un arrêt supplémentaire, une attente au-delà du temps offert ({wait} minutes à l'aéroport après l'atterrissage, {waitOther} minutes pour les autres prises en charge).",
          ],
        },
        {
          h2: "5. Paiement",
          body: [
            "Les modalités de paiement sont précisées par la centrale lors de la confirmation de la réservation. Aucune donnée bancaire n'est collectée par téléphone.",
          ],
        },
        {
          h2: "6. Modification et annulation",
          bullets: [
            "Annulation gratuite jusqu'à {freeCancel} heures avant l'heure de prise en charge.",
            "Annulation moins de {freeCancel} heures avant : {lateCancel} % du prix peuvent être facturés.",
            "Absence du client au lieu de prise en charge sans annulation : {noShow} % du prix peuvent être facturés.",
            "Toute modification se fait auprès de la centrale, en rappelant la référence de réservation.",
          ],
        },
        {
          h2: "7. Obligations du client",
          body: [
            "Le client fournit des informations exactes (adresses, horaires, nombre de passagers et de bagages, numéro de vol ou de train). Le nombre de passagers et de bagages ne peut excéder la capacité du véhicule réservé. Les enfants voyagent dans un siège adapté, à demander lors de la réservation.",
          ],
        },
        {
          h2: "8. Retards et force majeure",
          body: [
            "Le chauffeur met tout en œuvre pour respecter l'heure de prise en charge. La responsabilité de RYDAR Privé ne saurait être engagée en cas de force majeure ou d'événement extérieur (conditions de circulation exceptionnelles, manifestations, intempéries…).",
          ],
        },
        {
          h2: "9. Réclamations et médiation",
          body: [
            "Toute réclamation peut être adressée à {email}. Conformément au Code de la consommation, le client peut recourir gratuitement au médiateur de la consommation : {mediator}.",
          ],
        },
        { h2: "10. Données personnelles", body: ["Le traitement de vos données est décrit dans notre politique de confidentialité."] },
        { h2: "11. Droit applicable", body: ["Les présentes conditions sont soumises au droit français."] },
      ],
    },
    en: {
      kind: "legal",
      nav: "Terms and conditions",
      title: "Terms and conditions",
      description: "Terms and conditions of the RYDAR Privé booking service.",
      h1: "Terms and conditions",
      sections: [
        {
          h2: "1. Purpose",
          body: [
            "These terms govern bookings of chauffeur-driven journeys made with RYDAR Privé ({company}) on the website, by phone or through any other channel.",
          ],
        },
        {
          h2: "2. Role of RYDAR Privé",
          body: [
            "RYDAR Privé acts as a booking platform: it receives your request, passes it to a professional partner VTC chauffeur and confirms your pickup. The transport is performed by the partner chauffeur.",
          ],
        },
        {
          h2: "3. Booking and confirmation",
          body: [
            "The online form and the phone assistant register a booking request. The booking becomes firm once our dispatch team confirms it (by phone, text or message). A reference (RP-…) is assigned to you.",
            "Bookings must be made at least {lead} minutes before the pickup time.",
          ],
        },
        {
          h2: "4. Prices",
          body: [
            "Prices are shown in euros, all taxes included. They are fixed at booking, either as a flat rate or based on the estimated distance and duration. The price shown is guaranteed for the time indicated at booking.",
            "A supplement, communicated to the customer, may apply for: a change of journey, an extra stop, waiting beyond the free time ({wait} minutes after landing at airports, {waitOther} minutes for other pickups).",
          ],
        },
        { h2: "5. Payment", body: ["Payment terms are given by our dispatch team when confirming the booking. No card details are collected over the phone."] },
        {
          h2: "6. Changes and cancellation",
          bullets: [
            "Free cancellation up to {freeCancel} hours before the pickup time.",
            "Cancellation less than {freeCancel} hours before: {lateCancel}% of the price may be charged.",
            "Customer absent at the pickup point without cancelling: {noShow}% of the price may be charged.",
            "Any change is made with our dispatch team, quoting the booking reference.",
          ],
        },
        {
          h2: "7. Customer obligations",
          body: [
            "The customer provides accurate information (addresses, times, number of passengers and suitcases, flight or train number). Passengers and luggage may not exceed the capacity of the booked vehicle. Children travel in a suitable seat, to be requested when booking.",
          ],
        },
        {
          h2: "8. Delays and force majeure",
          body: [
            "The chauffeur makes every effort to be on time. RYDAR Privé cannot be held liable in case of force majeure or external events (exceptional traffic conditions, demonstrations, severe weather…).",
          ],
        },
        {
          h2: "9. Complaints and mediation",
          body: [
            "Complaints can be sent to {email}. In accordance with the French Consumer Code, customers may use the consumer mediator free of charge: {mediator}.",
          ],
        },
        { h2: "10. Personal data", body: ["How we process your data is described in our privacy policy."] },
        { h2: "11. Governing law", body: ["These terms are governed by French law."] },
      ],
    },
  },
  privacy: {
    fr: {
      kind: "legal",
      nav: "Confidentialité",
      title: "Politique de confidentialité",
      description: "Comment RYDAR Privé collecte et utilise vos données personnelles.",
      h1: "Politique de confidentialité",
      sections: [
        { h2: "Responsable du traitement", body: ["{company}, {address}. Contact : {email}."] },
        {
          h2: "Données collectées",
          bullets: [
            "Identité et coordonnées : nom, téléphone, e-mail facultatif.",
            "Informations de trajet : adresses, date, heure, passagers, bagages, numéro de vol ou de train, remarques.",
            "Appels à l'assistant téléphonique : numéro appelant, enregistrement et transcription de la conversation.",
            "Données techniques : journaux de connexion conservés par l'hébergeur à des fins de sécurité.",
          ],
        },
        {
          h2: "Finalités et base légale",
          body: [
            "Vos données servent à traiter votre réservation, l'attribuer à un chauffeur, vous contacter au sujet de votre trajet et gérer les réclamations. Le traitement est nécessaire à l'exécution du contrat que vous demandez.",
            "Le site n'utilise ni cookie publicitaire ni outil de mesure d'audience. Le formulaire mémorise temporairement votre saisie dans votre navigateur (stockage de session) pour éviter de la perdre.",
          ],
        },
        {
          h2: "Destinataires",
          bullets: [
            "L'équipe de la centrale et le chauffeur partenaire chargé de votre trajet.",
            "Hébergement du site : Vercel Inc. (États-Unis).",
            "Messagerie de la centrale : Telegram.",
            "Assistant téléphonique : ElevenLabs (voix et transcription) et Twilio (téléphonie), selon la ligne utilisée.",
            "Recherche d'adresses : Géoplateforme de l'IGN (France) et Photon / OpenStreetMap (komoot, Allemagne).",
          ],
          body: [
            "Certains prestataires sont situés hors de l'Union européenne ; les transferts sont encadrés par les garanties prévues par le RGPD (clauses contractuelles types ou décision d'adéquation).",
          ],
        },
        {
          h2: "Durées de conservation",
          bullets: [
            "Données de réservation : 3 ans après la dernière prestation, puis suppression ou anonymisation (10 ans pour les pièces comptables).",
            "Enregistrements et transcriptions d'appels : {retention} jours au maximum.",
          ],
        },
        {
          h2: "Vos droits",
          body: [
            "Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité. Écrivez-nous à {email}. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).",
          ],
        },
      ],
    },
    en: {
      kind: "legal",
      nav: "Privacy",
      title: "Privacy policy",
      description: "How RYDAR Privé collects and uses your personal data.",
      h1: "Privacy policy",
      sections: [
        { h2: "Data controller", body: ["{company}, {address}. Contact: {email}."] },
        {
          h2: "Data we collect",
          bullets: [
            "Identity and contact details: name, phone, optional email.",
            "Journey information: addresses, date, time, passengers, luggage, flight or train number, notes.",
            "Calls to the phone assistant: caller number, recording and transcript of the conversation.",
            "Technical data: connection logs kept by our host for security purposes.",
          ],
        },
        {
          h2: "Purposes and legal basis",
          body: [
            "Your data is used to process your booking, assign it to a chauffeur, contact you about your journey and handle complaints. Processing is necessary to perform the contract you request.",
            "This website uses no advertising cookies and no analytics. The booking form temporarily keeps what you typed in your browser (session storage) so you don't lose it.",
          ],
        },
        {
          h2: "Recipients",
          bullets: [
            "Our dispatch team and the partner chauffeur in charge of your journey.",
            "Website hosting: Vercel Inc. (United States).",
            "Dispatch messaging: Telegram.",
            "Phone assistant: ElevenLabs (voice and transcription) and Twilio (telephony), depending on the line used.",
            "Address search: IGN Géoplateforme (France) and Photon / OpenStreetMap (komoot, Germany).",
          ],
          body: [
            "Some providers are located outside the European Union; transfers are covered by the safeguards provided by the GDPR (standard contractual clauses or adequacy decision).",
          ],
        },
        {
          h2: "Retention",
          bullets: [
            "Booking data: 3 years after the last service, then deleted or anonymised (10 years for accounting records).",
            "Call recordings and transcripts: {retention} days maximum.",
          ],
        },
        {
          h2: "Your rights",
          body: [
            "You have the right to access, rectify, erase, object, restrict and port your data. Write to us at {email}. You may also lodge a complaint with the CNIL (cnil.fr), the French data protection authority.",
          ],
        },
      ],
    },
  },
};

export function getPageContent(key: PageKey, locale: Locale): PageContent {
  return CONTENT[key][locale];
}
