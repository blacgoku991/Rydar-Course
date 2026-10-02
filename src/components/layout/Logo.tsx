import styles from "./Logo.module.css";

/** Monogramme + logotype RYDAR PRIVÉ. */
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.logo} aria-label="RYDAR Privé">
      <svg className={styles.mark} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="rydar-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f1f4f6" />
            <stop offset="0.55" stopColor="#a9bbc5" />
            <stop offset="1" stopColor="#dbe3e8" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill="none" stroke="url(#rydar-mark)" strokeWidth="1" />
        <path
          d="M14 29V11h7.2c3.6 0 5.8 2 5.8 5.1 0 2.5-1.5 4.2-3.9 4.8L27.6 29h-3.1l-4.2-7.8H16.7V29H14Zm2.7-10.2h4.3c2.1 0 3.3-1 3.3-2.7s-1.2-2.7-3.3-2.7h-4.3v5.4Z"
          fill="url(#rydar-mark)"
        />
      </svg>
      {!compact && (
        <span className={styles.word}>
          <span className={styles.main}>RYDAR</span>
          <span className={styles.sub}>PRIVÉ</span>
        </span>
      )}
    </span>
  );
}
