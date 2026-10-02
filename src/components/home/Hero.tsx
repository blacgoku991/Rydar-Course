import type { ComponentProps } from "react";
import BookingWidget from "@/components/booking/BookingWidget";
import LightTrails from "./LightTrails";
import styles from "./Hero.module.css";

interface Props {
  kicker: string;
  title1: string;
  title2: string;
  lead: string;
  trust?: string[];
  scrollLabel?: string;
  scrollTarget?: string;
  variant?: "home" | "page";
  breadcrumb?: React.ReactNode;
  widget: ComponentProps<typeof BookingWidget>;
}

export default function Hero({ kicker, title1, title2, lead, trust, scrollLabel, scrollTarget, variant = "home", breadcrumb, widget }: Props) {
  return (
    <section className={`${styles.hero} ${variant === "page" ? styles.page : ""}`} aria-labelledby="hero-title">
      <div className={styles.media} aria-hidden="true">
        <LightTrails className={styles.canvas} />
        <div className={styles.vignette} />
        <div className={styles.grid} />
      </div>
      <div className={`container ${styles.layout}`}>
        <div className={styles.copy}>
          {breadcrumb}
          <span className={`kicker ${styles.kicker}`}>{kicker}</span>
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.line}>
              <span className={styles.lineInner}>{title1}</span>
            </span>
            <span className={styles.line}>
              <span className={`${styles.lineInner} ${styles.em} platinum-text`}>{title2}</span>
            </span>
          </h1>
          <p className={styles.lead}>{lead}</p>
          {trust && (
            <ul className={styles.trust}>
              {trust.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.panel} id="reserver">
          <BookingWidget {...widget} />
        </div>
      </div>
      {scrollLabel && scrollTarget && (
        <a href={`#${scrollTarget}`} className={styles.scroll}>
          <span>{scrollLabel}</span>
          <span className={styles.scrollLine} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
