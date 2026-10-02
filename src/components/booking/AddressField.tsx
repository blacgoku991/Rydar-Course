"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale, Place } from "@/lib/types";
import styles from "./Booking.module.css";

interface Props {
  label: string;
  value: Place | null;
  text: string;
  locale: Locale;
  t: Dictionary["booking"];
  popular: Place[];
  allowLocation?: boolean;
  marker: "a" | "b";
  error?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onText: (text: string) => void;
  onSelect: (place: Place | null) => void;
}

type Option = { type: "place"; place: Place } | { type: "location" };

export default function AddressField({ label, value, text, locale, t, popular, allowLocation, marker, error, inputRef, onText, onSelect }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<number | null>(null);

  const query = text.trim();
  const showPopular = query.length < 2;
  const options: Option[] = showPopular
    ? [...(allowLocation ? [{ type: "location" } as Option] : []), ...popular.map((p) => ({ type: "place", place: p }) as Option)]
    : (results ?? []).map((p) => ({ type: "place", place: p }) as Option);

  useEffect(() => {
    if (!open || showPopular || (value && value.label === text)) return;
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(query)}&locale=${locale}`, { signal: ctrl.signal });
        const json = (await res.json()) as { places?: Place[] };
        setResults(json.places ?? []);
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, open, showPopular, locale, value, text]);

  function choose(opt: Option) {
    if (opt.type === "location") {
      locate();
      return;
    }
    onSelect(opt.place);
    onText(opt.place.label);
    setOpen(false);
    setActive(-1);
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/places/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&locale=${locale}`);
          const json = (await res.json()) as { place: Place | null };
          if (json.place) {
            onSelect(json.place);
            onText(json.place.label);
            setOpen(false);
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault();
        choose(options[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const activeId = open && active >= 0 && options[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div className={`${styles.address} ${error ? styles.hasError : ""}`}>
      <span className={`${styles.marker} ${marker === "b" ? styles.markerB : ""}`} aria-hidden="true" />
      <label htmlFor={`${id}-input`} className={styles.label}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={`${id}-input`}
        className={styles.addressInput}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={t.placeholder}
        value={text}
        onChange={(e) => {
          onText(e.target.value);
          if (value) onSelect(null);
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 160);
        }}
        onKeyDown={onKeyDown}
      />
      {value && <span className={styles.check} aria-hidden="true" />}
      {open && (
        <div className={styles.dropdown}>
          {showPopular && <div className={styles.dropdownTitle}>{t.popular}</div>}
          <ul id={listId} role="listbox" aria-label={label} className={styles.options}>
            {options.map((opt, i) => (
              <li
                key={opt.type === "location" ? "loc" : opt.place.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`${styles.option} ${i === active ? styles.optionActive : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(opt)}
              >
                {opt.type === "location" ? (
                  <>
                    <PlaceIcon kind="location" />
                    <span>{locating ? t.locating : t.myLocation}</span>
                  </>
                ) : (
                  <>
                    <PlaceIcon kind={opt.place.kind} />
                    <span className={styles.optionText}>{opt.place.label}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!showPopular && loading && options.length === 0 && <div className={styles.dropdownNote}>{t.searching}</div>}
          {!showPopular && !loading && results !== null && options.length === 0 && <div className={styles.dropdownNote}>{t.noResult}</div>}
        </div>
      )}
      {error && (
        <p id={`${id}-err`} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PlaceIcon({ kind }: { kind: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;
  switch (kind) {
    case "airport":
      return (
        <svg {...common} className={styles.optionIcon}>
          <path d="M3 13.5 21 8l-1.5-2L14 7.5 9 3H7l2.5 5.5L5 10 3.5 8.5H2l1 5Z" strokeLinejoin="round" />
          <path d="M3 20h18" />
        </svg>
      );
    case "station":
      return (
        <svg {...common} className={styles.optionIcon}>
          <rect x="6" y="3" width="12" height="14" rx="3" />
          <path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4" />
          <circle cx="9.5" cy="14" r=".6" fill="currentColor" />
          <circle cx="14.5" cy="14" r=".6" fill="currentColor" />
        </svg>
      );
    case "location":
      return (
        <svg {...common} className={styles.optionIcon}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
    case "landmark":
    case "poi":
      return (
        <svg {...common} className={styles.optionIcon}>
          <path d="M4 21h16M6 21V10M18 21V10M10 21v-6h4v6M3 10l9-6 9 6" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common} className={styles.optionIcon}>
          <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      );
  }
}
