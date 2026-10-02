"use client";

import { useEffect, useState } from "react";
import CallButton from "@/components/voice/CallButton";
import type { Dictionary } from "@/i18n";
import styles from "./MobileBar.module.css";

/**
 * Barre d'action fixe sur mobile : réserver / appeler (l'assistant vocal répond aussitôt, pas de ligne téléphonique).
 * Masquée quand le formulaire est à l'écran.
 */
export default function MobileBar({ nav, homePath }: { nav: Dictionary["nav"]; homePath: string }) {
  const [hidden, setHidden] = useState(false);
  const [href, setHref] = useState(`${homePath}#reserver`);
  useEffect(() => {
    const target = document.getElementById("reserver");
    setHref(target ? "#reserver" : `${homePath}#reserver`);
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.15 });
    io.observe(target);
    return () => io.disconnect();
  }, [homePath]);
  return (
    <div className={`${styles.bar} ${hidden ? styles.hidden : ""}`} aria-hidden={hidden || undefined}>
      <a href={href} className={`btn btn-primary ${styles.book}`} tabIndex={hidden ? -1 : undefined}>
        {nav.book}
      </a>
      <CallButton label={nav.call} className={`btn btn-ghost ${styles.call}`} tabIndex={hidden ? -1 : undefined} />
    </div>
  );
}
