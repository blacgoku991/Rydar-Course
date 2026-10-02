import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUSINESS } from "@/config/business";
import { BOARD_ROUTES } from "@/config/board";
import { PRICING, VEHICLE_IDS } from "@/config/pricing";
import JsonLd from "@/components/layout/JsonLd";
import DepartureBoard, { type BoardRow } from "@/components/home/DepartureBoard";
import Hero from "@/components/home/Hero";
import { Faq, FinalCta, Fleet, Promises, Services, Steps, Voice, type FleetItem } from "@/components/home/Sections";
import styles from "@/components/home/Home.module.css";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { VEHICLE_TEXT } from "@/i18n/vehicles";
import { VEHICLES } from "@/config/pricing";
import { fixedFareFrom } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { widgetProps } from "@/lib/site-data";
import { formatMoney } from "@/lib/time";
import type { Locale } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  return pageMetadata("home", lang, dict.meta.title, dict.meta.description, true);
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function fleetItems(locale: Locale): FleetItem[] {
  return VEHICLE_IDS.map((id) => {
    const fixedMin = Math.min(...PRICING.fixedFares.map((f) => f.prices[id]));
    const from = Math.min(fixedMin, PRICING.perKm[id].minimum);
    return {
      id,
      ...VEHICLE_TEXT[locale][id],
      ...VEHICLES[id],
      fromTrip: formatMoney(from * 100, locale),
      hourly: formatMoney(PRICING.hourly.rates[id] * 100, locale),
    };
  });
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);

  const rows: BoardRow[] = BOARD_ROUTES.map((r) => {
    const prices = fixedFareFrom(r.a, r.b);
    return {
      code: r.code,
      label: r.label[lang],
      duration: durationLabel(r.minutes),
      price: prices ? formatMoney(prices.business * 100, lang) : "—",
      prefill: r.prefill,
    };
  });
  const cdgPrice = fixedFareFrom("paris", "cdg");

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dict.faq.items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };

  return (
    <>
      <Hero
        kicker={dict.hero.kicker}
        title1={dict.hero.title1}
        title2={dict.hero.title2}
        lead={dict.hero.lead}
        trust={dict.hero.trust}
        scrollLabel={dict.hero.scroll}
        scrollTarget="departs"
        widget={widgetProps(lang)}
      />

      <section className={`section ${styles.boardSection}`} id="departs" aria-labelledby="board-title">
        <div className={`container ${styles.boardLayout}`}>
          <div className="section-head" data-reveal>
            <span className="kicker">{dict.board.kicker}</span>
            <h2 id="board-title" className="section-title">
              {dict.board.title}
            </h2>
            <p className="lead">{dict.board.lead}</p>
          </div>
          <div data-reveal>
            <DepartureBoard rows={rows} cols={dict.board.cols} status={dict.board.status} note={dict.board.durationNote} locale={lang} />
          </div>
        </div>
      </section>

      <Services dict={dict.services} />
      <Fleet dict={dict.fleet} items={fleetItems(lang)} />
      <Steps dict={dict.steps} />
      <Voice dict={dict.voice} price={cdgPrice ? formatMoney(cdgPrice.business * 100, lang) : ""} />
      <Promises dict={dict.promises} airport={BUSINESS.freeWaitingAirportMinutes} other={BUSINESS.freeWaitingOtherMinutes} />
      <Faq title={dict.faq.title} kicker={dict.faq.kicker} items={dict.faq.items} />
      <FinalCta dict={dict.cta} />
      <JsonLd data={faqLd} />
    </>
  );
}
