"use client";

import { useEffect, useState } from "react";
import { openVoiceAssistant } from "@/components/voice/events";
import type { Dictionary } from "@/i18n";
import styles from "./MobileBar.module.css";

/** Barre d'action fixe sur mobile : réserver / assistant vocal / appeler. Masquée quand le formulaire est à l'écran. */
export default function MobileBar({
  nav,
  assistantLabel,
  homePath,
  phoneHref,
  phoneDisplay,
}: {
  nav: Dictionary["nav"];
  assistantLabel: string;
  homePath: string;
  phoneHref: string;
  phoneDisplay: string;
}) {
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
      <button type="button" className={`btn btn-ghost ${styles.call}`} onClick={openVoiceAssistant} aria-haspopup="dialog" tabIndex={hidden ? -1 : undefined}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
        {assistantLabel}
      </button>
      {phoneHref && (
        <a href={phoneHref} className={`btn btn-ghost ${styles.iconOnly}`} aria-label={`${nav.call} ${phoneDisplay}`} tabIndex={hidden ? -1 : undefined}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
          </svg>
        </a>
      )}
    </div>
  );
}
