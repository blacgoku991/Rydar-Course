import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS } from "@/config/business";
import JsonLd from "@/components/layout/JsonLd";
import Hero from "@/components/home/Hero";
import { Faq, FinalCta } from "@/components/home/Sections";
import styles from "@/components/page/Page.module.css";
import { getPageContent, type LegalPage, type ServicePage } from "@/content/pages";
import { contentVars, fillVars } from "@/content/vars";
import { getDictionary, type Dictionary } from "@/i18n";
import { isLocale, LOCALES } from "@/i18n/config";
import { keyFromSlug, PAGE_KEYS, PAGE_SLUGS, pathFor, SERVICE_PAGES, type PageKey } from "@/i18n/routes";
import { VEHICLE_TEXT } from "@/i18n/vehicles";
import { siteUrl } from "@/lib/env";
import { fixedFareFrom } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { widgetProps } from "@/lib/site-data";
import { formatMoney } from "@/lib/time";
import type { Locale } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((lang) => PAGE_KEYS.map((k) => ({ lang, slug: PAGE_SLUGS[k][lang] })));
}

async function resolve(params: Promise<{ lang: string; slug: string }>) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return null;
  const key = keyFromSlug(slug, lang);
  if (!key) return null;
  return { lang, key, content: getPageContent(key, lang) };
}

function varsFor(content: ServicePage | LegalPage, lang: Locale) {
  const fare = content.kind === "service" ? content.fares?.[0] : undefined;
  return contentVars(lang, fare);
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const vars = varsFor(r.content, r.lang);
  return pageMetadata(r.key, r.lang, fillVars(r.content.title, vars), fillVars(r.content.description, vars));
}

export default async function Page({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const r = await resolve(params);
  if (!r) notFound();
  const dict = getDictionary(r.lang);
  return r.content.kind === "service" ? (
    <ServiceView lang={r.lang} pageKey={r.key} content={r.content} dict={dict} />
  ) : (
    <LegalView lang={r.lang} content={r.content} dict={dict} />
  );
}

function Breadcrumb({ lang, label, dict }: { lang: Locale; label: string; dict: Dictionary }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link href={pathFor("home", lang)}>{dict.page.breadcrumbHome}</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{label}</span>
    </nav>
  );
}

function ServiceView({ lang, pageKey, content, dict }: { lang: Locale; pageKey: PageKey; content: ServicePage; dict: Dictionary }) {
  const vars = varsFor(content, lang);
  const f = (s: string) => fillVars(s, vars);
  const base = siteUrl();
  const url = `${base}${pathFor(pageKey, lang)}`;
  const names = VEHICLE_TEXT[lang];
  const fares = (content.fares ?? []).map((fare) => ({ ...fare, prices: fixedFareFrom(fare.a, fare.b) })).filter((x) => x.prices);
  const faq = content.faq.map((it) => ({ q: f(it.q), a: f(it.a) }));
  const related = SERVICE_PAGES.filter((k) => k !== pageKey);

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: f(content.title),
      serviceType: content.serviceType,
      description: f(content.description),
      url,
      provider: { "@id": `${base}/#organization` },
      areaServed: { "@type": "AdministrativeArea", name: "Île-de-France" },
      ...(fares[0]?.prices
        ? {
            offers: (["business", "van", "prestige"] as const).map((v) => ({
              "@type": "Offer",
              name: `${fares[0].label} — ${names[v].name}`,
              price: fares[0].prices![v],
              priceCurrency: "EUR",
            })),
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: dict.page.breadcrumbHome, item: `${base}${pathFor("home", lang)}` },
        { "@type": "ListItem", position: 2, name: content.nav, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
    },
  ];

  return (
    <>
      <Hero
        variant="page"
        breadcrumb={<Breadcrumb lang={lang} label={content.nav} dict={dict} />}
        kicker={content.kicker}
        title1={content.h1}
        title2={content.h1Em}
        lead={f(content.intro)}
        trust={dict.hero.trust}
        widget={widgetProps(lang, content.prefill)}
      />

      {fares.length > 0 && (
        <section className={`section ${styles.faresSection}`} aria-labelledby="fares-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <span className="kicker">{dict.page.fares}</span>
              <h2 id="fares-title" className="section-title">
                {fares.length === 1 ? fares[0].label : dict.page.fares}
              </h2>
              <p className="lead">{dict.page.faresNote}</p>
            </div>
            <div className={styles.tableWrap} data-reveal>
              <table className={styles.fares}>
                <thead>
                  <tr>
                    <th scope="col">{dict.board.cols.route}</th>
                    {(["business", "van", "prestige"] as const).map((v) => (
                      <th key={v} scope="col">
                        {names[v].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fares.map((fare) => (
                    <tr key={fare.label}>
                      <th scope="row">{fare.label}</th>
                      {(["business", "van", "prestige"] as const).map((v) => (
                        <td key={v}>{formatMoney(fare.prices![v] * 100, lang)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-label={content.nav}>
        <div className={`container ${styles.article}`}>
          <div className={styles.prose}>
            {content.sections.map((s) => (
              <div key={s.h2} className={styles.block} data-reveal>
                <h2>{f(s.h2)}</h2>
                {s.body?.map((p) => (
                  <p key={p}>{f(p)}</p>
                ))}
                {s.bullets && (
                  <ul>
                    {s.bullets.map((b) => (
                      <li key={b}>{f(b)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <aside className={styles.aside}>
            <div className={styles.asideCard}>
              <p className={styles.asideTitle}>{content.nav}</p>
              {vars.from && (
                <p className={styles.asidePrice}>
                  <small>{dict.fleet.from}</small> {vars.from}
                </p>
              )}
              <a href="#reserver" className="btn btn-primary">
                {dict.page.bookCta}
              </a>
              {BUSINESS.phoneHref && (
                <a href={BUSINESS.phoneHref} className="btn btn-ghost">
                  {dict.nav.call} · {BUSINESS.phoneDisplay}
                </a>
              )}
            </div>
          </aside>
        </div>
      </section>

      <Faq title={dict.page.faq} items={faq} id="faq" />

      <section className={styles.related} aria-labelledby="related-title">
        <div className="container">
          <h2 id="related-title" className={styles.relatedTitle}>
            {dict.page.related}
          </h2>
          <ul className={styles.relatedList}>
            {related.map((k) => (
              <li key={k}>
                <Link href={pathFor(k, lang)}>
                  <span>{getPageContent(k, lang).nav}</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FinalCta dict={dict.cta} />
      <JsonLd data={ld} />
    </>
  );
}

function LegalView({ lang, content, dict }: { lang: Locale; content: LegalPage; dict: Dictionary }) {
  const vars = varsFor(content, lang);
  const f = (s: string) => fillVars(s, vars);
  return (
    <section className={styles.legal}>
      <div className="container">
        <Breadcrumb lang={lang} label={content.nav} dict={dict} />
        <h1 className={styles.legalTitle}>{content.h1}</h1>
        <div className={styles.prose}>
          {content.sections.map((s) => (
            <div key={s.h2} className={styles.block}>
              <h2>{f(s.h2)}</h2>
              {s.body?.map((p) => (
                <p key={p}>{f(p)}</p>
              ))}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>{f(b)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
