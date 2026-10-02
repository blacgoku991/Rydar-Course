import Link from "next/link";
import { BUSINESS } from "@/config/business";
import type { Dictionary } from "@/i18n";
import { pathFor } from "@/i18n/routes";
import { getPageContent } from "@/content/pages";
import type { Locale } from "@/lib/types";
import Logo from "./Logo";
import styles from "./Footer.module.css";

export default function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const f = dict.footer;
  const year = new Date().getFullYear();
  const services = (["cdg", "orly", "chauffeur", "hourly"] as const).map((k) => ({ href: pathFor(k, locale), label: getPageContent(k, locale).nav }));
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.brand}>
          <Logo />
          <p className={styles.tagline}>{f.tagline}</p>
        </div>
        <nav aria-label={f.services}>
          <h2 className={styles.title}>{f.services}</h2>
          <ul>
            {services.map((s) => (
              <li key={s.href}>
                <Link href={s.href}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={f.company}>
          <h2 className={styles.title}>{f.company}</h2>
          <ul>
            <li>
              <Link href={pathFor("legal", locale)}>{f.legal}</Link>
            </li>
            <li>
              <Link href={pathFor("terms", locale)}>{f.terms}</Link>
            </li>
            <li>
              <Link href={pathFor("privacy", locale)}>{f.privacy}</Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className={styles.title}>{f.contact}</h2>
          <ul>
            {BUSINESS.phoneHref && (
              <li>
                <a href={BUSINESS.phoneHref}>{BUSINESS.phoneDisplay}</a>
              </li>
            )}
            {BUSINESS.whatsappHref && (
              <li>
                <a href={BUSINESS.whatsappHref} rel="noopener" target="_blank">
                  WhatsApp
                </a>
              </li>
            )}
            {BUSINESS.email && (
              <li>
                <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
              </li>
            )}
            <li>
              <a href={`${pathFor("home", locale)}#reserver`}>{dict.nav.book}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className={`container ${styles.bottom}`}>
        <span>
          © {year} {BUSINESS.legalName || BUSINESS.brand}. {f.rights}
        </span>
        <span className={styles.wordmark} aria-hidden="true">
          RYDAR
        </span>
      </div>
    </footer>
  );
}
