"use client";

import { useEffect, useRef, useState } from "react";
import type { BookingPrefill } from "@/components/booking/BookingWidget";
import styles from "./DepartureBoard.module.css";

export interface BoardRow {
  code: string;
  label: string;
  duration: string;
  price: string;
  prefill: BookingPrefill;
}

interface Props {
  rows: BoardRow[];
  cols: { route: string; time: string; price: string; status: string };
  status: string;
  note: string;
  locale: string;
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Texte qui « défile » comme un panneau à palettes avant de se fixer. */
function FlapText({ text, start, delay }: { text: string; start: boolean; delay: number }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    let frame = 0;
    let raf = 0;
    let begin = 0;
    const run = (now: number) => {
      if (!begin) begin = now + delay;
      if (now >= begin) {
        frame++;
        const settled = Math.floor(frame / 2);
        setShown(
          text
            .split("")
            .map((c, i) => (i < settled || c === " " || c === "→" || c === "·" ? c : CHARS[Math.floor(Math.random() * CHARS.length)]))
            .join(""),
        );
        if (settled >= text.length) return;
      }
      raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [start, text, delay]);
  return (
    <span aria-hidden="true" className={styles.flap}>
      {shown}
    </span>
  );
}

export default function DepartureBoard({ rows, cols, status, note, locale }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStart(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      io.disconnect();
      window.clearInterval(id);
    };
  }, [locale]);

  const choose = (row: BoardRow) => {
    window.dispatchEvent(new CustomEvent("rydar:prefill", { detail: row.prefill }));
  };

  return (
    <div className={styles.board} ref={ref}>
      <div className={styles.top}>
        <span className={styles.city}>PARIS</span>
        <span className={styles.clock} suppressHydrationWarning>
          {clock}
        </span>
      </div>
      <div className={`${styles.row} ${styles.headRow}`} aria-hidden="true">
        <span />
        <span>{cols.route}</span>
        <span className={styles.colTime}>{cols.time}</span>
        <span className={styles.colPrice}>{cols.price}</span>
        <span className={styles.colStatus}>{cols.status}</span>
      </div>
      <ul className={styles.list}>
        {rows.map((row, i) => (
          <li key={row.code}>
            <button type="button" className={styles.row} onClick={() => choose(row)} aria-label={`${row.label} — ${row.duration} — ${row.price}`}>
              <span className={styles.code}>{row.code}</span>
              <span className={styles.route}>
                <FlapText text={row.label.toUpperCase()} start={start} delay={i * 120} />
              </span>
              <span className={styles.colTime}>
                <FlapText text={row.duration.toUpperCase()} start={start} delay={i * 120 + 200} />
              </span>
              <span className={`${styles.colPrice} ${styles.price}`}>
                <FlapText text={row.price} start={start} delay={i * 120 + 300} />
              </span>
              <span className={`${styles.colStatus} ${styles.status}`}>
                <span className={styles.dot} aria-hidden="true" />
                {status}
              </span>
              <span className={styles.go} aria-hidden="true">
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{note}</p>
    </div>
  );
}
