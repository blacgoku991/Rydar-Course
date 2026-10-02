"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/lib/types";
import { VOICE_EVENT, type VoiceEventDetail } from "./events";
import styles from "./VoiceAssistant.module.css";

type Phase = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";
type Line = { id: number; who: "user" | "agent"; text: string };
type Session = { endSession(): Promise<void>; getInputVolume(): number; getOutputVolume(): number };

/**
 * Assistant vocal sur le site : même agent ElevenLabs que le téléphone, lancé
 * dans la langue de la page avec channel="web" (l'agent demande alors le numéro).
 */
export default function VoiceAssistant({ locale, dict, privacyHref }: { locale: Locale; dict: Dictionary["assistant"]; privacyHref: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const session = useRef<Session | null>(null);
  const orb = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);
  /** Change à chaque raccrochage : un lancement encore en cours (micro, jeton, connexion) est alors abandonné. */
  const attempt = useRef(0);
  /** Lancement en cours (numéro de tentative) : un second appui sur « Appeler » n'ouvre pas une autre conversation. */
  const launching = useRef<number | null>(null);

  const active = phase === "connecting" || phase === "listening" || phase === "speaking";

  const stop = useCallback(async () => {
    attempt.current += 1;
    const s = session.current;
    session.current = null;
    if (s) await s.endSession().catch(() => undefined);
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  const start = useCallback(async () => {
    if (session.current || launching.current === attempt.current) return;
    const mine = attempt.current;
    // Raccroché (ou panneau fermé) depuis : cette tentative ne touche plus à rien.
    const live = () => attempt.current === mine;
    launching.current = mine;
    setError(null);
    setLines([]);
    setPhase("connecting");

    try {
      // Demande le micro d'abord pour afficher un message clair en cas de refus.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        if (live()) fail(dict.mic);
        return;
      }
      if (!live()) return;

      let auth: { token?: string; agentId?: string };
      try {
        const res = await fetch("/api/agent/session", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; agentId?: string };
        if (!live()) return;
        if (!res.ok || !data.ok) return fail(res.status === 429 ? dict.busy : dict.error);
        auth = data;
      } catch {
        if (live()) fail(dict.error);
        return;
      }

      try {
        const { Conversation } = await import("@elevenlabs/client");
        if (!live()) return;
        const options = {
          overrides: { agent: { language: locale, firstMessage: dict.firstMessage } },
          dynamicVariables: { channel: "web" },
          onConnect: () => live() && setPhase("listening"),
          onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => live() && setPhase(mode),
          onMessage: ({ message, role }: { message: string; role: "user" | "agent" }) => {
            if (!live() || !message.trim()) return;
            setLines((prev) => [...prev.slice(-11), { id: ++lineId.current, who: role, text: message }]);
          },
          onDisconnect: (details: { reason: string }) => {
            // Raccroché par le client : l'état « terminée » est déjà affiché (une nouvelle conversation a pu commencer).
            if (!live()) return;
            session.current = null;
            if (details.reason === "error") fail(dict.error);
            else setPhase("ended");
          },
          onError: (message: string) => console.warn("[rydar] assistant vocal", message),
        };
        const s = auth.token
          ? await Conversation.startSession({ ...options, conversationToken: auth.token, connectionType: "webrtc" })
          : await Conversation.startSession({ ...options, agentId: auth.agentId!, connectionType: "webrtc" });
        if (!live()) {
          void s.endSession().catch(() => undefined);
          return;
        }
        session.current = s;
      } catch (err) {
        if (!live()) return;
        console.warn("[rydar] assistant vocal", err);
        fail(dict.error);
      }
    } finally {
      if (launching.current === mine) launching.current = null;
    }
  }, [dict, fail, locale]);

  const hangup = useCallback(() => {
    void stop();
    setPhase("ended");
  }, [stop]);

  const close = useCallback(() => {
    void stop();
    setOpen(false);
    setPhase((p) => (p === "error" ? "idle" : p === "idle" ? p : "ended"));
  }, [stop]);

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // Ouverture depuis les autres boutons du site (« Appeler » : conversation lancée aussitôt, l'appui du client
  // autorise le micro), ou par lien direct : …/fr?assistant=1 ou …/fr#assistant ouvre l'assistant dès l'arrivée.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      if ((e as CustomEvent<VoiceEventDetail>).detail?.call) void startRef.current();
    };
    const url = new URL(window.location.href);
    if (url.searchParams.has("assistant") || url.hash === "#assistant") setOpen(true);
    window.addEventListener(VOICE_EVENT, onOpen);
    return () => window.removeEventListener(VOICE_EVENT, onOpen);
  }, []);

  // Fin de la conversation si la page est quittée.
  useEffect(() => () => void stop(), [stop]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Halo de l'orbe animé par le volume (sans re-rendu React).
  useEffect(() => {
    if (!active) {
      orb.current?.style.setProperty("--lvl", "0");
      return;
    }
    let raf = 0;
    const tick = () => {
      const s = session.current;
      const lvl = s ? Math.min(1, Math.max(s.getInputVolume(), s.getOutputVolume()) * 1.6) : 0;
      orb.current?.style.setProperty("--lvl", lvl.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const statusText =
    phase === "connecting"
      ? dict.status.connecting
      : phase === "listening"
        ? dict.status.listening
        : phase === "speaking"
          ? dict.status.speaking
          : phase === "ended"
            ? dict.status.ended
            : phase === "error"
              ? error
              : dict.subtitle;

  return (
    <>
      <button type="button" className={`${styles.launcher} ${open ? styles.launcherHidden : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className={styles.launcherOrb} aria-hidden="true" />
        {dict.open}
      </button>

      {open && (
        <div ref={panel} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="voice-assistant-title" tabIndex={-1}>
          <div className={styles.head}>
            <div>
              <strong id="voice-assistant-title" className={styles.title}>
                {dict.title}
              </strong>
              <span className={styles.brand}>RYDAR Privé</span>
            </div>
            <button type="button" className={styles.close} onClick={close} aria-label={dict.close}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className={styles.stage}>
            <div ref={orb} className={`${styles.orb} ${styles[phase]}`} aria-hidden="true">
              <span className={styles.ring} />
              <span className={styles.ring} />
              <span className={styles.core} />
            </div>
            <p className={`${styles.status} ${phase === "error" ? styles.statusError : ""}`} aria-live="polite">
              {statusText}
            </p>
            {phase === "idle" && <p className={styles.hint}>{dict.hint}</p>}
          </div>

          {lines.length > 0 && (
            <ol ref={log} className={styles.log} aria-live="polite">
              {lines.map((l) => (
                <li key={l.id} className={l.who === "agent" ? styles.agent : styles.user}>
                  <span className={styles.who}>{l.who === "agent" ? dict.ai : dict.you}</span>
                  {l.text}
                </li>
              ))}
            </ol>
          )}

          <div className={styles.actions}>
            {active ? (
              <button type="button" className={`btn ${styles.hangup}`} onClick={hangup}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 14.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.3-1.4v-2.4a12 12 0 0 0-6.6 0v2.4l-3.3 1.4L3 14.5Z" strokeLinejoin="round" />
                </svg>
                {dict.end}
              </button>
            ) : (
              <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={() => void start()}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                </svg>
                {dict.start}
              </button>
            )}
            <p className={styles.notice}>
              {dict.notice} <a href={privacyHref}>{dict.privacy}</a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
