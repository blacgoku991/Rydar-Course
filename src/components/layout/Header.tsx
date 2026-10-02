"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n";
import { pathFor, switchLocalePath } from "@/i18n/routes";
import type { Locale } from "@/lib/types";
import Logo from "./Logo";
import styles from "./Header.module.css";

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
  a11y: Dictionary["a11y"];
  phoneHref: string;
  phoneDisplay: string;
}

export default function Header({ locale, nav, a11y, phoneHref, phoneDisplay }: Props) {
  const pathname = usePathname() || `/${locale}`;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const home = pathFor("home", locale);
  const onHome = pathname === home;
  const anchor = (id: string) => (onHome ? `#${id}` : `${home}#${id}`);
  // Les pages de service ont leur propre formulaire : « Réserver » y renvoie directement.
  const [bookHref, setBookHref] = useState(anchor("reserver"));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setBookHref(document.getElementById("reserver") ? "#reserver" : `${home}#reserver`);
  }, [pathname, home]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { id: "services", label: nav.services },
    { id: "flotte", label: nav.fleet },
    { id: "fonctionnement", label: nav.how },
    { id: "telephone", label: nav.voice },
    { id: "questions", label: nav.faq },
  ];

  return (
    <header className={`${styles.header} ${scrolled || open ? styles.solid : ""}`}>
      <div className={`container ${styles.inner}`}>
        <Link href={home} className={styles.brand} aria-label="RYDAR Privé">
          <Logo />
        </Link>

        <nav className={styles.nav} aria-label="Navigation">
          {links.map((l) => (
            <a key={l.id} href={anchor(l.id)} className={styles.link}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <div className={styles.lang} role="group" aria-label={a11y.language}>
            {(["fr", "en"] as const).map((l) => (
              <Link
                key={l}
                href={switchLocalePath(pathname, l)}
                hrefLang={l}
                className={`${styles.langItem} ${l === locale ? styles.langActive : ""}`}
                aria-current={l === locale ? "true" : undefined}
                scroll={false}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
          {phoneHref && (
            <a href={phoneHref} className={styles.phone}>
              <PhoneIcon />
              <span>{phoneDisplay}</span>
            </a>
          )}
          <a href={bookHref} className={`btn btn-primary ${styles.cta}`}>
            {nav.book}
          </a>
          <button
            type="button"
            className={styles.burger}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? a11y.close : a11y.menu}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <div id="mobile-menu" className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} hidden={!open}>
        <nav className="container" aria-label="Navigation mobile">
          {links.map((l, i) => (
            <a key={l.id} href={anchor(l.id)} className={styles.drawerLink} style={{ transitionDelay: `${60 + i * 40}ms` }} onClick={() => setOpen(false)}>
              <span className={styles.drawerIndex}>0{i + 1}</span>
              {l.label}
            </a>
          ))}
          <div className={styles.drawerActions}>
            <a href={bookHref} className="btn btn-primary" onClick={() => setOpen(false)}>
              {nav.book}
            </a>
            {phoneHref && (
              <a href={phoneHref} className="btn btn-ghost">
                {nav.call} · {phoneDisplay}
              </a>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    </svg>
  );
}
