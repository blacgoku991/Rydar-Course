import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { BUSINESS } from "@/config/business";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import JsonLd from "@/components/layout/JsonLd";
import MobileBar from "@/components/layout/MobileBar";
import RevealObserver from "@/components/layout/RevealObserver";
import { getDictionary } from "@/i18n";
import { HTML_LANG, isLocale, LOCALES, OG_LOCALE } from "@/i18n/config";
import { pathFor } from "@/i18n/routes";
import { siteUrl } from "@/lib/env";
import { bodoni, manrope } from "../fonts";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: "#080a0c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: dict.meta.title, template: `%s | ${BUSINESS.brand}` },
    description: dict.meta.description,
    applicationName: BUSINESS.brand,
    openGraph: { type: "website", siteName: BUSINESS.brand, locale: OG_LOCALE[lang] },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
    robots: process.env.NEXT_PUBLIC_NOINDEX === "1" ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const base = siteUrl();
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: BUSINESS.brand,
    url: `${base}${pathFor("home", lang)}`,
    logo: `${base}/icon.svg`,
    ...(BUSINESS.phoneDisplay ? { telephone: BUSINESS.phoneDisplay } : {}),
    ...(BUSINESS.email ? { email: BUSINESS.email } : {}),
    areaServed: { "@type": "AdministrativeArea", name: "Île-de-France" },
  };
  return (
    <html lang={HTML_LANG[lang]} className={`${bodoni.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <a className="skip-link" href="#main">
          {dict.a11y.skip}
        </a>
        <Header locale={lang} nav={dict.nav} a11y={dict.a11y} phoneHref={BUSINESS.phoneHref} phoneDisplay={BUSINESS.phoneDisplay} />
        <main id="main">{children}</main>
        <Footer locale={lang} dict={dict} />
        <MobileBar nav={dict.nav} homePath={pathFor("home", lang)} phoneHref={BUSINESS.phoneHref} phoneDisplay={BUSINESS.phoneDisplay} />
        <RevealObserver />
        <JsonLd data={org} />
      </body>
    </html>
  );
}
