"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleId } from "@/config/pricing";
import { fill, type Dictionary } from "@/i18n";
import { formatDateShort, formatMoney } from "@/lib/time";
import type { Locale, Place, QuoteResponse, ServiceType } from "@/lib/types";
import AddressField from "./AddressField";
import VehicleGlyph from "./VehicleGlyph";
import styles from "./Booking.module.css";

export interface VehicleInfo {
  id: VehicleId;
  name: string;
  models: string;
  passengers: number;
  luggage: number;
}

export interface BookingPrefill {
  dropoffId?: string;
  pickupId?: string;
  dropoffQuery?: string;
  pickupQuery?: string;
  mode?: ServiceType;
}

export interface BookingConfig {
  minLeadMinutes: number;
  quoteValidityMinutes: number;
  maxChildSeats: number;
  minHours: number;
  maxHours: number;
  phoneDisplay: string;
  phoneHref: string;
  termsHref: string;
  privacyHref: string;
}

interface Props {
  locale: Locale;
  t: Dictionary["booking"];
  errors: Dictionary["errors"];
  vehicles: VehicleInfo[];
  known: Place[];
  popular: Place[];
  initial?: BookingPrefill;
  config: BookingConfig;
  headingLevel?: "h2" | "h3";
}

type Step = 1 | 2 | 3 | 4;

interface Form {
  mode: ServiceType;
  pickup: Place | null;
  pickupText: string;
  dropoff: Place | null;
  dropoffText: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  childSeats: number;
  hours: number;
  vehicle: VehicleId | null;
  name: string;
  phone: string;
  email: string;
  flight: string;
  signName: string;
  notes: string;
  consent: boolean;
}

interface Done {
  ref: string;
  priceCents: number | null;
  demo: boolean;
}

const STORAGE_KEY = "rydar.booking.v1";
const STORAGE_TTL = 3 * 60 * 60 * 1000;

const EMPTY: Form = {
  mode: "transfer",
  pickup: null,
  pickupText: "",
  dropoff: null,
  dropoffText: "",
  date: "",
  time: "",
  passengers: 2,
  luggage: 2,
  childSeats: 0,
  hours: 3,
  vehicle: null,
  name: "",
  phone: "",
  email: "",
  flight: "",
  signName: "",
  notes: "",
  consent: false,
};

/** Date/heure par défaut (heure de Paris) : maintenant + délai minimum, arrondi au quart d'heure. */
function defaultPickup(leadMinutes: number) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()))
    parts[p.type] = p.value;
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const step = 15 * 60000;
  const target = Math.ceil((wall + (leadMinutes + 30) * 60000) / step) * step;
  const d = new Date(target);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const isHub = (p: Place | null) => !!p && (p.kind === "airport" || p.kind === "station");

export default function BookingWidget({ locale, t, errors, vehicles, known, popular, initial, config, headingLevel = "h2" }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState<Step>(1);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"pickup" | "dropoff" | "name" | "phone" | "email" | "consent" | "vehicle", string>>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [minDate, setMinDate] = useState<string>("");
  const [restored, setRestored] = useState(false);
  const startedAt = useRef<number>(0);
  const idemKey = useRef<string>("");
  const rootRef = useRef<HTMLDivElement>(null);
  const pickupRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  const patch = useCallback((p: Partial<Form>) => setForm((f) => ({ ...f, ...p })), []);

  const applyPrefill = useCallback(
    (pre: BookingPrefill) => {
      const next: Partial<Form> = {};
      if (pre.mode) next.mode = pre.mode;
      const byId = (id?: string) => (id ? (known.find((k) => k.id === `known:${id}`) ?? null) : null);
      const drop = byId(pre.dropoffId);
      if (drop) Object.assign(next, { dropoff: drop, dropoffText: drop.label });
      else if (pre.dropoffQuery) Object.assign(next, { dropoff: null, dropoffText: pre.dropoffQuery });
      const pick = byId(pre.pickupId);
      if (pick) Object.assign(next, { pickup: pick, pickupText: pick.label });
      else if (pre.pickupQuery) Object.assign(next, { pickup: null, pickupText: pre.pickupQuery });
      setForm((f) => ({ ...f, ...next }));
      setStep(1);
      setQuote(null);
    },
    [known],
  );

  // Initialisation côté navigateur : valeurs par défaut, restauration, pré-remplissage.
  useEffect(() => {
    startedAt.current = Date.now();
    const def = defaultPickup(config.minLeadMinutes);
    setMinDate(def.today);
    let base: Form = { ...EMPTY, date: def.date, time: def.time };
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { savedAt: number; form: Form };
        if (Date.now() - saved.savedAt < STORAGE_TTL && saved.form) {
          base = { ...base, ...saved.form, consent: false };
          if (!base.date || base.date < def.today) Object.assign(base, { date: def.date, time: def.time });
          setRestored(!!(saved.form.pickup || saved.form.dropoff));
        }
      }
    } catch {
      /* stockage indisponible */
    }
    setForm(base);
    hydrated.current = true;
    if (initial && !(base.pickup || base.dropoff)) applyPrefill(initial);
    else if (initial?.mode) setForm((f) => ({ ...f, mode: initial.mode! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), form: { ...form, consent: false } }));
    } catch {
      /* stockage indisponible */
    }
  }, [form]);

  useEffect(() => {
    const onPrefill = (e: Event) => {
      applyPrefill((e as CustomEvent<BookingPrefill>).detail ?? {});
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => pickupRef.current?.focus({ preventScroll: true }), 500);
    };
    window.addEventListener("rydar:prefill", onPrefill);
    return () => window.removeEventListener("rydar:prefill", onPrefill);
  }, [applyPrefill]);

  const goto = (s: Step) => {
    setStep(s);
    setError(null);
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const errText = (code: string) => {
    const msg = (errors as Record<string, string>)[code] ?? errors.generic;
    return fill(msg, { minutes: config.minLeadMinutes });
  };

  async function requestQuote(silent = false) {
    const fe: typeof fieldErrors = {};
    if (!form.pickup) fe.pickup = errors.pickup;
    if (form.mode === "transfer" && !form.dropoff) fe.dropoff = errors.dropoff;
    setFieldErrors(fe);
    if (Object.keys(fe).length) return false;
    setBusy(true);
    if (!silent) setError(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          service: form.mode,
          pickup: form.pickup,
          dropoff: form.mode === "transfer" ? form.dropoff : null,
          hours: form.mode === "hourly" ? form.hours : undefined,
          date: form.date,
          time: form.time,
          passengers: form.passengers,
          luggage: form.luggage,
          childSeats: form.childSeats,
        }),
      });
      const json = (await res.json()) as { ok: boolean; quote?: QuoteResponse; error?: string };
      if (!json.ok || !json.quote) {
        setError(errText(json.error ?? "generic"));
        return false;
      }
      setQuote(json.quote);
      const current = json.quote.options.find((o) => o.vehicle === form.vehicle && o.available);
      const first = json.quote.options.find((o) => o.available);
      patch({ vehicle: current?.vehicle ?? first?.vehicle ?? null });
      if (!silent) goto(2);
      return true;
    } catch {
      setError(errors.network);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quote) return goto(1);
    const fe: typeof fieldErrors = {};
    if (!form.vehicle) fe.vehicle = errors.vehicle;
    if (form.name.trim().length < 2) fe.name = errors.invalid_name;
    if (form.phone.replace(/\D/g, "").length < 8) fe.phone = errors.invalid_phone;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) fe.email = errors.invalid_email;
    if (!form.consent) fe.consent = errors.consent_required;
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          token: quote.token,
          vehicle: form.vehicle,
          name: form.name,
          phone: form.phone,
          email: form.email,
          flight: form.flight,
          signName: form.signName,
          notes: form.notes,
          consent: form.consent,
          idempotencyKey: idemKey.current,
          elapsedMs: Date.now() - startedAt.current,
          company: (document.getElementById(`${rootId}-company`) as HTMLInputElement | null)?.value ?? "",
        }),
      });
      const json = (await res.json()) as { ok: boolean; ref?: string; priceCents?: number | null; demo?: boolean; error?: string };
      if (!json.ok || !json.ref) {
        if (json.error === "quote_expired") {
          setBusy(false);
          await requestQuote(true);
          goto(2);
          setError(errors.quote_expired);
          return;
        }
        if (json.error === "invalid_phone") setFieldErrors({ phone: errors.invalid_phone });
        setError(errText(json.error ?? "generic"));
        return;
      }
      setDone({ ref: json.ref, priceCents: json.priceCents ?? null, demo: !!json.demo });
      goto(4);
      setForm((f) => ({ ...EMPTY, date: f.date, time: f.time, name: f.name, phone: f.phone, email: f.email }));
    } catch {
      setError(errors.network);
    } finally {
      setBusy(false);
    }
  }

  const rootId = "booking";
  const H = headingLevel;
  const selected = quote?.options.find((o) => o.vehicle === form.vehicle) ?? null;
  const money = (cents: number) => formatMoney(cents, locale);

  const summary = quote && (
    <div className={styles.summary}>
      <div className={styles.summaryRoute}>
        <span className={styles.summaryDot} aria-hidden="true" />
        <span>{quote.pickup.label}</span>
        {quote.dropoff && (
          <>
            <span className={`${styles.summaryDot} ${styles.summaryDotB}`} aria-hidden="true" />
            <span>{quote.dropoff.label}</span>
          </>
        )}
      </div>
      <div className={styles.summaryMeta}>
        <span>
          {formatDateShort(quote.date, locale)} · {quote.time}
        </span>
        <span>{fill(t.capacity, { p: quote.passengers, l: quote.luggage })}</span>
        {quote.service === "hourly" && quote.hours ? <span>{fill(t.hourlySummary, { h: quote.hours })}</span> : null}
        {quote.distanceKm !== null && quote.durationMin !== null && quote.service === "transfer" && (
          <span>{fill(t.distance, { km: quote.distanceKm.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB"), min: quote.durationMin })}</span>
        )}
        {!quote.quoteRequired && <span className={styles.badge}>{quote.fixed ? t.fixed : t.metered}</span>}
      </div>
      <button type="button" className={styles.linkBtn} onClick={() => goto(1)}>
        {t.edit}
      </button>
    </div>
  );

  return (
    <div className={styles.widget} ref={rootRef} id={`${rootId}-widget`}>
      <div className={styles.head}>
        <H className={styles.title}>{t.title}</H>
        {step < 4 && (
          <ol className={styles.progress} aria-label={t.title}>
            {t.steps.map((label, i) => (
              <li
                key={label}
                className={i + 1 === step ? styles.progressActive : i + 1 < step ? styles.progressDone : ""}
                aria-current={i + 1 === step ? "step" : undefined}
              >
                <span className={styles.progressNum}>{i + 1}</span>
                <span className={styles.progressLabel}>{label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {restored && step === 1 && <p className={styles.restored}>{t.restore}</p>}

      {step === 1 && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void requestQuote();
          }}
          noValidate
        >
          <div className={styles.modes} role="radiogroup" aria-label={t.title}>
            {(["transfer", "hourly"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={form.mode === m}
                className={`${styles.mode} ${form.mode === m ? styles.modeActive : ""}`}
                onClick={() => {
                  patch({ mode: m });
                  setQuote(null);
                }}
              >
                {t.modes[m]}
              </button>
            ))}
          </div>

          <div className={`${styles.route} ${form.mode === "hourly" ? styles.routeSingle : ""}`}>
            <AddressField
              label={t.pickup}
              marker="a"
              value={form.pickup}
              text={form.pickupText}
              locale={locale}
              t={t}
              popular={popular}
              allowLocation
              inputRef={pickupRef}
              error={fieldErrors.pickup}
              onText={(v) => patch({ pickupText: v })}
              onSelect={(p) => {
                patch({ pickup: p });
                if (p) setFieldErrors((fe) => ({ ...fe, pickup: undefined }));
              }}
            />
            {form.mode === "transfer" && (
              <>
                <button
                  type="button"
                  className={styles.swap}
                  aria-label={t.swap}
                  title={t.swap}
                  onClick={() => patch({ pickup: form.dropoff, pickupText: form.dropoffText, dropoff: form.pickup, dropoffText: form.pickupText })}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="M7 4v16M7 4 3.5 7.5M7 4l3.5 3.5M17 20V4m0 16-3.5-3.5M17 20l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <AddressField
                  label={t.dropoff}
                  marker="b"
                  value={form.dropoff}
                  text={form.dropoffText}
                  locale={locale}
                  t={t}
                  popular={popular}
                  error={fieldErrors.dropoff}
                  onText={(v) => patch({ dropoffText: v })}
                  onSelect={(p) => {
                    patch({ dropoff: p });
                    if (p) setFieldErrors((fe) => ({ ...fe, dropoff: undefined }));
                  }}
                />
              </>
            )}
          </div>

          <div className={styles.row2}>
            <label className={styles.field}>
              <span className={styles.label}>{t.date}</span>
              <input
                type="date"
                className={styles.input}
                value={form.date}
                min={minDate || undefined}
                required
                onChange={(e) => patch({ date: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                {t.time} <span className={styles.hint}>· {t.timeHint}</span>
              </span>
              <input type="time" className={styles.input} value={form.time} step={300} required onChange={(e) => patch({ time: e.target.value })} />
            </label>
          </div>

          <div className={styles.row3}>
            <Counter label={t.passengers} value={form.passengers} min={1} max={16} onChange={(v) => patch({ passengers: v })} t={t} />
            <Counter label={t.luggage} value={form.luggage} min={0} max={20} onChange={(v) => patch({ luggage: v })} t={t} />
            {form.mode === "hourly" ? (
              <Counter
                label={t.hours}
                value={form.hours}
                min={config.minHours}
                max={config.maxHours}
                suffix={t.hoursUnit}
                onChange={(v) => patch({ hours: v })}
                t={t}
              />
            ) : (
              <Counter label={t.childSeats} value={form.childSeats} min={0} max={config.maxChildSeats} onChange={(v) => patch({ childSeats: v })} t={t} />
            )}
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={busy}>
            {busy ? t.loadingRates : t.seeRates}
            {!busy && <span className="arrow">→</span>}
          </button>
        </form>
      )}

      {step === 2 && quote && (
        <div className={styles.form}>
          {summary}
          {quote.quoteRequired && <p className={styles.notice}>{t.onRequestNote}</p>}
          <div className={styles.vehicles} role="radiogroup" aria-label={t.steps[1]}>
            {quote.options.map((o) => {
              const v = vehicles.find((x) => x.id === o.vehicle)!;
              const active = form.vehicle === o.vehicle;
              return (
                <button
                  key={o.vehicle}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!o.available}
                  className={`${styles.vehicle} ${active ? styles.vehicleActive : ""}`}
                  onClick={() => patch({ vehicle: o.vehicle })}
                >
                  <VehicleGlyph id={o.vehicle} className={styles.vehicleGlyph} />
                  <span className={styles.vehicleInfo}>
                    <span className={styles.vehicleName}>{v.name}</span>
                    <span className={styles.vehicleModels}>{v.models}</span>
                    <span className={styles.vehicleCap}>{o.available ? fill(t.capacity, { p: v.passengers, l: v.luggage }) : t.tooSmall}</span>
                  </span>
                  <span className={styles.vehiclePrice}>{o.priceCents === null ? t.onRequest : money(o.priceCents)}</span>
                </button>
              );
            })}
          </div>
          {!quote.quoteRequired && <p className={styles.small}>{fill(t.priceNote, { minutes: config.quoteValidityMinutes })}</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={() => goto(1)}>
              {t.back}
            </button>
            <button
              type="button"
              className={`btn btn-primary ${styles.grow}`}
              disabled={!selected?.available}
              onClick={() => {
                idemKey.current = uuid();
                goto(3);
              }}
            >
              {t.continue} <span className="arrow">→</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && quote && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          {summary}
          <div className={styles.chosen}>
            <span>{vehicles.find((v) => v.id === form.vehicle)?.name}</span>
            <strong>{selected?.priceCents != null ? money(selected.priceCents) : t.onRequest}</strong>
          </div>
          <TextField label={t.name} value={form.name} autoComplete="name" error={fieldErrors.name} onChange={(v) => patch({ name: v })} required />
          <TextField
            label={t.phone}
            value={form.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            hint={t.phoneHint}
            error={fieldErrors.phone}
            onChange={(v) => patch({ phone: v })}
            required
          />
          <TextField
            label={t.email}
            value={form.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            error={fieldErrors.email}
            onChange={(v) => patch({ email: v })}
          />
          {(isHub(quote.pickup) || isHub(quote.dropoff)) && (
            <TextField label={t.flight} value={form.flight} autoComplete="off" hint={t.flightHint} onChange={(v) => patch({ flight: v.toUpperCase() })} />
          )}
          {isHub(quote.pickup) && <TextField label={t.sign} value={form.signName} autoComplete="off" onChange={(v) => patch({ signName: v })} />}
          <label className={styles.field}>
            <span className={styles.label}>{t.notes}</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              rows={2}
              maxLength={600}
              placeholder={t.notesPlaceholder}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>
          <div className={styles.honeypot} aria-hidden="true">
            <label>
              Company
              <input id={`${rootId}-company`} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          <label className={`${styles.consent} ${fieldErrors.consent ? styles.consentError : ""}`}>
            <input type="checkbox" checked={form.consent} onChange={(e) => patch({ consent: e.target.checked })} />
            <span>
              <ConsentText
                template={t.consent}
                terms={
                  <a href={config.termsHref} target="_blank" rel="noopener">
                    {t.termsLink}
                  </a>
                }
                privacy={
                  <a href={config.privacyHref} target="_blank" rel="noopener">
                    {t.privacyLink}
                  </a>
                }
              />
            </span>
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={() => goto(2)}>
              {t.back}
            </button>
            <button type="submit" className={`btn btn-primary ${styles.grow}`} disabled={busy}>
              {busy ? t.sending : quote.quoteRequired ? t.submitQuote : t.submit}
            </button>
          </div>
        </form>
      )}

      {step === 4 && done && (
        <div className={styles.done} role="status">
          <svg className={styles.doneIcon} viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M20 33l8 8 16-18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className={styles.doneTitle}>{t.doneTitle}</h3>
          <p className={styles.doneText}>{t.doneText}</p>
          <div className={styles.ref}>
            <span>{t.doneRef}</span>
            <strong>{done.ref}</strong>
          </div>
          {done.priceCents !== null && (
            <p className={styles.small}>
              {t.total} : {money(done.priceCents)}
            </p>
          )}
          {config.phoneDisplay && <p className={styles.small}>{fill(t.doneCall, { phone: config.phoneDisplay })}</p>}
          {done.demo && <p className={styles.notice}>{t.demo}</p>}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDone(null);
              setQuote(null);
              goto(1);
            }}
          >
            {t.newBooking}
          </button>
        </div>
      )}
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  t,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  t: Dictionary["booking"];
}) {
  return (
    <div className={styles.counter} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.counterRow}>
        <button
          type="button"
          className={styles.counterBtn}
          aria-label={`${t.decrease} — ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <output className={styles.counterValue} aria-live="polite">
          {value}
          {suffix ? <small>{suffix}</small> : null}
        </output>
        <button
          type="button"
          className={styles.counterBtn}
          aria-label={`${t.increase} — ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  hint,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id={`${id}-err`} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.hintLine}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ConsentText({ template, terms, privacy }: { template: string; terms: React.ReactNode; privacy: React.ReactNode }) {
  const parts = template.split(/(\{terms\}|\{privacy\})/);
  return (
    <>{parts.map((p, i) => (p === "{terms}" ? <span key={i}>{terms}</span> : p === "{privacy}" ? <span key={i}>{privacy}</span> : <span key={i}>{p}</span>))}</>
  );
}
