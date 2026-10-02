import Link from "next/link";
import styles from "@/components/page/Page.module.css";

/** Page 404 (bilingue : la langue n'est pas toujours connue ici). */
export default function NotFound() {
  return (
    <section className={styles.notFound}>
      <div className="container">
        <span className="kicker">404</span>
        <h1 className={styles.legalTitle}>
          Cette page n&apos;existe pas
          <br />
          <em className="italic">This page does not exist</em>
        </h1>
        <div className={styles.notFoundActions}>
          <Link href="/fr" className="btn btn-primary">
            Accueil
          </Link>
          <Link href="/en" className="btn btn-ghost">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
