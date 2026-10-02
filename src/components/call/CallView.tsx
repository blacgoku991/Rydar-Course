import CallButton from "@/components/voice/CallButton";
import type { Dictionary } from "@/i18n";
import { pathFor } from "@/i18n/routes";
import type { Locale } from "@/lib/types";
import styles from "./CallView.module.css";

/**
 * Page « Appeler » (lien des publicités Meta, Google…) : un seul gros bouton qui lance l'assistant vocal. Pas de ligne
 * téléphonique : la conversation se fait dans le navigateur, avec le même agent que le téléphone. Le navigateur
 * exige un appui du client avant le micro : l'appel ne peut pas démarrer seul à l'ouverture de la page.
 */
export default function CallView({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const c = dict.call;
  return (
    <section className={styles.call}>
      <div className={`container ${styles.inner}`}>
        <span className="kicker">{c.kicker}</span>
        <h1 className={styles.title}>{c.title}</h1>
        <p className={`lead ${styles.lead}`}>{c.lead}</p>

        <CallButton label={c.button} className={styles.dial} />
        <p className={styles.note}>{c.note}</p>

        <ol className={styles.steps}>
          {c.steps.map((step, i) => (
            <li key={step}>
              <span className={styles.stepIndex} aria-hidden="true">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <ul className={styles.langs}>
          {dict.voice.langs.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <p className={styles.notice}>
          {dict.assistant.notice} <a href={pathFor("privacy", lang)}>{dict.assistant.privacy}</a>
        </p>
        <a href={`${pathFor("home", lang)}#reserver`} className="btn btn-ghost">
          {c.online} <span className="arrow">→</span>
        </a>
      </div>
    </section>
  );
}
