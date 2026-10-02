import type { Dictionary } from "@/i18n";
import { fill } from "@/i18n";
import type { VehicleId } from "@/config/pricing";
import VehicleGlyph from "@/components/booking/VehicleGlyph";
import CallButton from "@/components/voice/CallButton";
import styles from "./Sections.module.css";

/* ---------- Services ---------- */

const SERVICE_ICONS = [
  // Avion
  <svg key="a" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <path d="M6 27 42 16l-3-4-11 3-10-9h-4l5 11-9 3-3-3H4l2 10Z" strokeLinejoin="round" />
    <path d="M6 40h36" />
  </svg>,
  // Gare / ville
  <svg key="b" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <rect x="12" y="6" width="24" height="28" rx="6" />
    <path d="M12 22h24M18 42l3-8M30 42l-3-8" />
    <circle cx="19" cy="28" r="1.2" fill="currentColor" />
    <circle cx="29" cy="28" r="1.2" fill="currentColor" />
  </svg>,
  // Horloge
  <svg key="c" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <circle cx="24" cy="24" r="17" />
    <path d="M24 13v11l7 5" strokeLinecap="round" />
  </svg>,
  // Mallette
  <svg key="d" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <rect x="6" y="14" width="36" height="24" rx="3" />
    <path d="M18 14v-4h12v4M6 24h36" />
  </svg>,
];

export function Services({ dict }: { dict: Dictionary["services"] }) {
  return (
    <section className="section" id="services" aria-labelledby="services-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="kicker">{dict.kicker}</span>
          <h2 id="services-title" className="section-title">
            {dict.title}
          </h2>
        </div>
        <div className={styles.services}>
          {dict.items.map((item, i) => (
            <article key={item.title} className={styles.service} data-reveal style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
              <span className={styles.serviceIndex}>0{i + 1}</span>
              <div className={styles.serviceIcon}>{SERVICE_ICONS[i]}</div>
              <h3 className={styles.serviceTitle}>{item.title}</h3>
              <p className={styles.serviceText}>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Flotte ---------- */

export interface FleetItem {
  id: VehicleId;
  name: string;
  models: string;
  tagline: string;
  passengers: number;
  luggage: number;
  fromTrip: string;
  hourly: string;
}

export function Fleet({ dict, items }: { dict: Dictionary["fleet"]; items: FleetItem[] }) {
  return (
    <section className={`section ${styles.fleetSection}`} id="flotte" aria-labelledby="fleet-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="kicker">{dict.kicker}</span>
          <h2 id="fleet-title" className="section-title">
            {dict.title}
          </h2>
        </div>
        <div className={styles.fleet}>
          {items.map((v, i) => (
            <article key={v.id} className={styles.car} data-reveal style={{ "--reveal-delay": `${i * 110}ms` } as React.CSSProperties}>
              <div className={styles.carStage}>
                <VehicleGlyph id={v.id} detailed className={styles.carGlyph} />
                <span className={styles.carSweep} aria-hidden="true" />
              </div>
              <div className={styles.carBody}>
                <h3 className={styles.carName}>{v.name}</h3>
                <p className={styles.carTagline}>{v.tagline}</p>
                <p className={styles.carModels}>{v.models}</p>
                <ul className={styles.carSpecs}>
                  <li>
                    <PaxIcon /> {v.passengers}
                  </li>
                  <li>
                    <BagIcon /> {v.luggage}
                  </li>
                </ul>
                <div className={styles.carPrices}>
                  <span>
                    <small>{dict.from}</small>
                    <strong>{v.fromTrip}</strong>
                  </span>
                  <span>
                    <strong>{v.hourly}</strong>
                    <small>{dict.perHour}</small>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.footnote}>{dict.note}</p>
      </div>
    </section>
  );
}

function PaxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="6" y="7" width="12" height="13" rx="2" />
      <path d="M9 7V4h6v3M10 20v1.5M14 20v1.5" />
    </svg>
  );
}

/* ---------- Fonctionnement ---------- */

export function Steps({ dict }: { dict: Dictionary["steps"] }) {
  return (
    <section className="section" id="fonctionnement" aria-labelledby="steps-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="kicker">{dict.kicker}</span>
          <h2 id="steps-title" className="section-title">
            {dict.title}
          </h2>
        </div>
        <ol className={styles.steps} data-reveal>
          {dict.items.map((s, i) => (
            <li key={s.title} className={styles.step} style={{ "--i": i } as React.CSSProperties}>
              <span className={styles.stepNode} aria-hidden="true">
                <span>{String(i + 1).padStart(2, "0")}</span>
              </span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepText}>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Téléphone IA ---------- */

export function Voice({ dict, price }: { dict: Dictionary["voice"]; price: string }) {
  return (
    <section className={`section ${styles.voiceSection}`} id="telephone" aria-labelledby="voice-title">
      <div className={`container ${styles.voice}`}>
        <div className={styles.voiceCopy} data-reveal>
          <span className="kicker">{dict.kicker}</span>
          <h2 id="voice-title" className="section-title">
            {dict.title}
          </h2>
          <p className="lead">{dict.text}</p>
          <ul className={styles.langs}>
            {dict.langs.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {/* Pas de ligne téléphonique : « Appeler » lance l'assistant vocal du site (même agent) */}
          <div className={styles.voiceActions}>
            <CallButton label={dict.cta} className={`btn btn-primary ${styles.voiceCta}`} />
            <a href="#reserver" className="btn btn-ghost">
              {dict.bookOnline} <span className="arrow">→</span>
            </a>
          </div>
          <p className={styles.voiceNote}>{dict.note}</p>
        </div>
        <div className={styles.call} data-reveal style={{ "--reveal-delay": "120ms" } as React.CSSProperties}>
          <div className={styles.callHead}>
            <span className={styles.callAvatar} aria-hidden="true">
              R
            </span>
            <span>
              <strong>RYDAR Privé</strong>
              <small>{dict.sample}</small>
            </span>
            <span className={styles.wave} aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ "--d": `${(i % 7) * 0.11}s` } as React.CSSProperties} />
              ))}
            </span>
          </div>
          <ol className={styles.transcript}>
            {dict.transcript.map((line, i) => (
              <li key={i} className={line.who === "ai" ? styles.ai : styles.client} style={{ "--i": i } as React.CSSProperties}>
                {fill(line.text, { price })}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------- Engagements ---------- */

export function Promises({ dict, airport, other }: { dict: Dictionary["promises"]; airport: number; other: number }) {
  return (
    <section className="section" aria-labelledby="promises-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="kicker">{dict.kicker}</span>
          <h2 id="promises-title" className="section-title">
            {dict.title}
          </h2>
        </div>
        <div className={styles.promises}>
          {dict.items.map((p, i) => (
            <div key={p.title} className={styles.promise} data-reveal style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
              <span className={styles.promiseLine} aria-hidden="true" />
              <h3 className={styles.promiseTitle}>{p.title}</h3>
              <p className={styles.promiseText}>{fill(p.text, { airport, other })}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

export function Faq({ title, kicker, items, id = "questions" }: { title: string; kicker?: string; items: { q: string; a: string }[]; id?: string }) {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.faqWrap}`}>
        <div className="section-head" data-reveal>
          {kicker && <span className="kicker">{kicker}</span>}
          <h2 id={`${id}-title`} className="section-title">
            {title}
          </h2>
        </div>
        <div className={styles.faq} data-reveal>
          {items.map((it) => (
            <details key={it.q} className={styles.faqItem}>
              <summary>
                <span>{it.q}</span>
                <span className={styles.faqPlus} aria-hidden="true" />
              </summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Appel final ---------- */

export function FinalCta({ dict, href = "#reserver" }: { dict: Dictionary["cta"]; href?: string }) {
  return (
    <section className={styles.final} aria-labelledby="final-title">
      <div className="container" data-reveal>
        <h2 id="final-title" className={styles.finalTitle}>
          {dict.title}
        </h2>
        <p className="lead">{dict.text}</p>
        <a href={href} className="btn btn-primary">
          {dict.book} <span className="arrow">→</span>
        </a>
      </div>
    </section>
  );
}
