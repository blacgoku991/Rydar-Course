"use client";

import { useState } from "react";
import { lastNoticeLine, liveTrackingDetail, type DriveWebhookStatus } from "./drive-status";
import styles from "./setup.module.css";

type Status = {
  siteUrl: string;
  appSecret: boolean;
  store: "redis" | "memory";
  commissionPercent: number;
  phoneDisplayed: string | null;
  rides: string;
  telegram: {
    token: boolean;
    chatId: string | null;
    adminChatId: string | null;
    bot?: string;
    webhookUrl?: string | null;
    webhookOk?: boolean;
    lastError?: string | null;
    error?: string;
  };
  elevenlabs: { apiKey: boolean; agentId: string | null; voiceId: string | null; languages: string[]; webhookSecret: boolean };
  twilio: { configured: boolean; number: string | null };
  humanTransfer: boolean;
  drive: {
    configured: boolean;
    url: string | null;
    webhook: DriveWebhookStatus;
  };
};

type Log = { ok: boolean; text: string; extra?: string };

export default function SetupPanel() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);

  async function call(action: string) {
    setBusy(action);
    try {
      const res = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, action }) });
      const json = await res.json();
      if (action === "status" && json.ok) setStatus(json.status);
      else if (!json.ok) setLogs((l) => [{ ok: false, text: json.message ?? json.error }, ...l]);
      else {
        let extra: string | undefined;
        if (json.agent?.webhookSecret)
          extra = `Facultatif : ajoutez ELEVENLABS_WEBHOOK_SECRET=${json.agent.webhookSecret} dans Vercel (affiché une seule fois).`;
        if (json.agent?.warnings?.length) extra = [extra, ...json.agent.warnings].filter(Boolean).join("\n");
        setLogs((l) => [{ ok: true, text: json.message, extra }, ...l]);
      }
      if (action !== "status" && json.ok) void refresh();
    } catch {
      setLogs((l) => [{ ok: false, text: "Erreur réseau." }, ...l]);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    const res = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, action: "status" }) });
    const json = await res.json();
    if (json.ok) setStatus(json.status);
  }

  const Item = ({ ok, label, detail }: { ok: boolean; label: string; detail?: React.ReactNode }) => (
    <li className={ok ? styles.ok : styles.todo}>
      <span className={styles.dot} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </li>
  );

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Configuration</h1>
      <p className={styles.lead}>
        Page privée. Entrez la valeur de <code>APP_SECRET</code> définie dans Vercel pour vérifier et brancher les services.
      </p>

      <form
        className={styles.keyForm}
        onSubmit={(e) => {
          e.preventDefault();
          void call("status");
        }}
      >
        <input type="password" placeholder="APP_SECRET" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" required />
        <button className="btn btn-primary" disabled={!key || busy !== null}>
          {busy === "status" ? "…" : "Vérifier"}
        </button>
      </form>

      {status && (
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>1. Site</h2>
            <ul className={styles.list}>
              <Item ok={!status.siteUrl.includes("localhost")} label="Adresse du site" detail={status.siteUrl} />
              <Item ok={status.appSecret} label="APP_SECRET" />
              <Item ok={!!status.phoneDisplayed} label="Numéro affiché" detail={status.phoneDisplayed ?? "NEXT_PUBLIC_PHONE_DISPLAY manquant"} />
              <Item
                ok={status.store === "redis"}
                label="Stockage"
                detail={status.store === "redis" ? "Upstash Redis" : "Mémoire (conseillé : ajouter Upstash Redis, gratuit)"}
              />
              <Item ok label={`Commission : ${status.commissionPercent} %`} />
            </ul>
          </section>

          <section className={styles.card}>
            <h2>2. Centrale Telegram</h2>
            <ul className={styles.list}>
              <Item ok={status.telegram.token} label="TELEGRAM_BOT_TOKEN" detail={status.telegram.bot ?? status.telegram.error} />
              <Item ok={!!status.telegram.chatId} label="TELEGRAM_CHAT_ID" detail={status.telegram.chatId ?? "Ajoutez le bot au groupe puis tapez /id"} />
              <Item
                ok={!!status.telegram.adminChatId}
                label="TELEGRAM_ADMIN_CHAT_ID (fiches admin)"
                detail={status.telegram.adminChatId ?? "Envoyez /id au bot en privé"}
              />
              <Item
                ok={status.rides === "blob" || status.rides === "redis"}
                label="Suivi des courses"
                detail={status.rides === "blob" ? "Vercel Blob (privé)" : status.rides === "redis" ? "Upstash Redis" : "Mémoire temporaire"}
              />
              <Item ok={!!status.telegram.webhookOk} label="Webhook" detail={status.telegram.lastError ?? status.telegram.webhookUrl ?? "non branché"} />
            </ul>
            <div className={styles.actions}>
              <button className="btn btn-primary" disabled={!status.telegram.token || busy !== null} onClick={() => call("telegram")}>
                {busy === "telegram" ? "…" : "Brancher Telegram"}
              </button>
              <button className="btn btn-ghost" disabled={!status.telegram.chatId || busy !== null} onClick={() => call("test_booking")}>
                {busy === "test_booking" ? "…" : "Envoyer une course test"}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2>Rydar Drive (dispatch)</h2>
            <ul className={styles.list}>
              <Item ok={!!status.drive.url} label="RYDAR_DRIVE_URL" detail={status.drive.url ?? "ex. https://app.rydar.app"} />
              <Item
                ok={status.drive.configured}
                label="RYDAR_DRIVE_API_KEY"
                detail={status.drive.configured ? "les courses partent dans Rydar Drive" : "sans clé : les courses vont dans le groupe Telegram"}
              />
              {!status.drive.webhook.secret && (
                <Item
                  ok={false}
                  label="Secret du suivi en direct manquant"
                  detail="APP_SECRET et RYDAR_DRIVE_WEBHOOK_SECRET sont vides : définissez APP_SECRET dans Vercel puis redéployez."
                />
              )}
              <Item
                ok={!!status.drive.webhook.registered && status.drive.webhook.registered.enabled && !status.drive.webhook.error}
                label="Suivi en direct (fiche admin mise à jour toute seule)"
                detail={liveTrackingDetail(status.drive.webhook)}
              />
              <Item {...lastNoticeLine(status.drive.webhook, status.store)} />
            </ul>
            <div className={styles.actions}>
              <button className="btn btn-primary" disabled={!status.drive.configured || busy !== null} onClick={() => call("drive")}>
                {busy === "drive" ? "…" : "Tester Rydar Drive"}
              </button>
              <button
                className="btn btn-ghost"
                disabled={!status.drive.configured || !status.drive.webhook.secret || busy !== null}
                onClick={() => call("drive_webhook")}
              >
                {busy === "drive_webhook" ? "…" : "Activer le suivi en direct"}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2>3. Assistant téléphonique</h2>
            <ul className={styles.list}>
              <Item ok={status.elevenlabs.apiKey} label="ELEVENLABS_API_KEY" />
              <Item
                ok={!!status.elevenlabs.voiceId}
                label="Voix"
                detail={status.elevenlabs.voiceId ?? "voix par défaut (conseillé : choisir une voix française)"}
              />
              <Item ok label={`Langues : ${status.elevenlabs.languages.join(", ")}`} />
              <Item ok={status.humanTransfer} label="Transfert vers un humain" detail={status.humanTransfer ? "activé" : "HUMAN_TRANSFER_NUMBER non défini"} />
              <Item ok={status.twilio.configured} label="Numéro Twilio" detail={status.twilio.number ?? "TWILIO_* manquants"} />
            </ul>
            <div className={styles.actions}>
              <button className="btn btn-primary" disabled={!status.elevenlabs.apiKey || busy !== null} onClick={() => call("agent")}>
                {busy === "agent" ? "…" : "Créer / mettre à jour l'agent"}
              </button>
              <button
                className="btn btn-ghost"
                disabled={!status.elevenlabs.apiKey || !status.twilio.configured || busy !== null}
                onClick={() => call("phone")}
              >
                {busy === "phone" ? "…" : "Relier le numéro Twilio"}
              </button>
            </div>
          </section>
        </div>
      )}

      {logs.length > 0 && (
        <section className={styles.logs} aria-live="polite">
          {logs.map((l, i) => (
            <div key={i} className={l.ok ? styles.logOk : styles.logErr}>
              <p>{l.text}</p>
              {l.extra && <pre>{l.extra}</pre>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
