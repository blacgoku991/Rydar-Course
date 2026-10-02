import "server-only";
import { cancelDriveRide, DRIVE_FINAL, DRIVE_STATUS_FR, DriveError, driveDriverLabel, getDriveRide, type DriveRide } from "@/lib/drive";
import { env } from "@/lib/env";
import { logLine, loadRide, recentRides, saveRide, updateRide, type Ride, type RideDriver } from "@/lib/rides";
import { sendToCentral, tg, TelegramError } from "@/lib/telegram/api";
import { escapeHtml } from "@/lib/telegram/entities";
import { adminKeyboard, adminText, driverKeyboard, driverText, groupKeyboard, groupText, parisClock, shortDate, shortPlace } from "@/lib/telegram/format";
import type { TgCallbackQuery, TgMessage, TgUpdate, TgUser } from "@/lib/telegram/types";
import type { Booking } from "@/lib/types";

/**
 * Centrale Telegram :
 *  - groupe chauffeurs : fiche courte + « ✋ JE PRENDS » (aucune donnée client) ;
 *  - le chauffeur qui prend reçoit les coordonnées en privé (le bot s'ouvre tout seul la 1re fois) ;
 *  - l'admin (TELEGRAM_ADMIN_CHAT_ID) suit tout : prix client, commission, historique, annulation.
 * Avec Rydar Drive : la course est dispatchée par Rydar Drive, pas de fiche dans le groupe ;
 * l'admin garde sa fiche, avec le statut Rydar Drive (bouton « Actualiser »).
 */

const HTML = { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as const;

function nameOf(u: TgUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Chauffeur";
}

function driverOf(u: TgUser): RideDriver {
  return { id: u.id, name: nameOf(u), username: u.username };
}

async function botUsername() {
  const g = globalThis as unknown as { __rydarBot?: string };
  if (!g.__rydarBot) g.__rydarBot = (await tg<{ username: string }>("getMe", {})).username;
  return g.__rydarBot;
}

async function sendAdmin(text: string, extra: Record<string, unknown> = {}) {
  const chat = env.telegramAdminChatId;
  if (!chat) return null;
  return tg<TgMessage>("sendMessage", { chat_id: chat, text, ...HTML, ...extra });
}

/** Modifie un message ; ignore « message is not modified » et les messages supprimés. */
async function edit(chatId: string | number | undefined, messageId: number | undefined, text: string, reply_markup: unknown) {
  if (!chatId || !messageId) return;
  try {
    await tg("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup, ...HTML });
  } catch (err) {
    if (err instanceof TelegramError && /not modified|not found|can't be edited/i.test(err.message)) return;
    console.error("[rydar] édition Telegram", err);
  }
}

/** Remet à jour les 3 messages (groupe, admin, chauffeur) d'après l'état de la course. */
async function refresh(ride: Ride, opts: { driver?: boolean; previousDriver?: RideDriver } = {}) {
  await edit(env.telegramChatId, ride.groupMsgId, groupText(ride), groupKeyboard(ride));
  await edit(env.telegramAdminChatId, ride.adminMsgId, adminText(ride), adminKeyboard(ride));
  const driver = opts.previousDriver ?? ride.driver;
  if (opts.driver && driver) await edit(driver.id, ride.driverMsgId, driverText(ride), driverKeyboard(ride));
}

/* ------------------------------------------------------------------ */
/* Publication                                                         */
/* ------------------------------------------------------------------ */

export async function postBookingToCentral(b: Booking, opts: { test?: boolean; drive?: DriveRide; driveError?: string } = {}) {
  const ride: Ride = {
    booking: b,
    status: "open",
    test: opts.test,
    log: [logLine(`Reçue (${b.source === "phone" ? "téléphone" : b.source === "voice" ? "assistant vocal" : "site"})`, new Date(b.createdAt))],
  };
  if (opts.drive) {
    ride.drive = { id: opts.drive.id, number: opts.drive.number, status: opts.drive.status };
    ride.log.push(logLine(`🚀 Envoyée à Rydar Drive${opts.drive.number ? ` (n° ${opts.drive.number})` : ""}`));
  } else {
    if (opts.driveError) ride.log.push(logLine(`⚠️ Rydar Drive a refusé (${opts.driveError.slice(0, 160)}) : envoyée au groupe`));
    const group = await sendToCentral<TgMessage>({ text: groupText(ride), reply_markup: groupKeyboard(ride), ...HTML });
    ride.groupMsgId = group.message_id;
  }
  try {
    const admin = await sendAdmin(adminText(ride), { reply_markup: adminKeyboard(ride) });
    if (admin) ride.adminMsgId = admin.message_id;
  } catch (err) {
    console.error("[rydar] fiche admin", err);
  }
  await saveRide(ride, null);
  return ride.groupMsgId ?? ride.adminMsgId ?? null;
}

/** Message libre pour l'admin (récapitulatif d'appel…). Sans admin configuré : dans le groupe. */
export async function notifyCentral(html: string) {
  if (env.telegramAdminChatId) return sendAdmin(html);
  return sendToCentral<TgMessage>({ text: html, ...HTML });
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

type Result = { ok: true; message: string } | { ok: false; message: string; openBot?: boolean };

/** Un chauffeur prend la course : verrou, envoi des détails en privé, mise à jour du groupe. */
export async function takeRide(ref: string, user: TgUser): Promise<Result> {
  const taken = await updateRide(ref, (r) => {
    if (r.status !== "open") return null;
    r.status = "taken";
    r.driver = driverOf(user);
    r.log.push(logLine(`✋ Prise par ${r.driver.name}${user.username ? ` (@${user.username})` : ""}`));
    return r;
  });
  if (!taken.ok) {
    if (taken.reason === "not_found") return { ok: false, message: "Course introuvable." };
    const cur = await loadRide(ref);
    if (cur?.ride.driver?.id === user.id && cur.ride.status === "taken") return { ok: true, message: "Elle est déjà à toi 👍" };
    return { ok: false, message: "Trop tard, cette course est déjà prise." };
  }

  // Détails en privé. Si le chauffeur n'a jamais ouvert le bot, on annule la prise.
  let driverMsg: TgMessage;
  try {
    driverMsg = await tg<TgMessage>("sendMessage", { chat_id: user.id, text: driverText(taken.ride), reply_markup: driverKeyboard(taken.ride), ...HTML });
  } catch {
    await updateRide(ref, (r) => {
      if (r.status !== "taken" || r.driver?.id !== user.id) return null;
      r.status = "open";
      r.driver = undefined;
      r.log.pop();
      return r;
    });
    return { ok: false, openBot: true, message: "Ouvre le bot et appuie sur DÉMARRER : la course te sera attribuée automatiquement." };
  }

  const saved = await updateRide(ref, (r) => {
    r.driverMsgId = driverMsg.message_id;
    return r;
  });
  await refresh(saved.ok ? saved.ride : taken.ride);
  return { ok: true, message: "✅ C'est à toi ! Les détails sont dans ta conversation privée avec le bot." };
}

async function driverAction(ref: string, user: TgUser, action: "done" | "rel"): Promise<Result> {
  const res = await updateRide(ref, (r) => {
    if (r.status !== "taken" || r.driver?.id !== user.id) return null;
    if (action === "done") {
      r.status = "done";
      r.log.push(logLine(`🏁 Terminée par ${r.driver.name}`));
    } else {
      r.status = "open";
      r.log.push(logLine(`↩️ Libérée par ${r.driver.name}`));
      r.driver = undefined;
    }
    return r;
  });
  if (!res.ok) return { ok: false, message: "Action impossible : cette course n'est plus à toi." };
  await refresh(res.ride, { driver: true, previousDriver: res.before.driver });
  return { ok: true, message: action === "done" ? "🏁 Merci, course terminée !" : "Course remise en ligne pour les autres chauffeurs." };
}

/** Relit le statut de la course dans Rydar Drive et met à jour la fiche admin. */
async function refreshDrive(ref: string): Promise<Result> {
  const cur = await loadRide(ref);
  if (!cur?.ride.drive) return { ok: false, message: "Course non liée à Rydar Drive." };
  let remote: DriveRide;
  try {
    remote = await getDriveRide(cur.ride.drive.id);
  } catch (err) {
    return { ok: false, message: `Rydar Drive : ${err instanceof DriveError ? err.message : "injoignable"}` };
  }
  const res = await updateRide(ref, (r) => {
    if (!r.drive) return null;
    const driver = driveDriverLabel(remote);
    if (r.drive.status === remote.status && r.drive.driver === driver) return null;
    if (r.drive.status !== remote.status) r.log.push(logLine(`Rydar Drive : ${DRIVE_STATUS_FR[remote.status] ?? remote.status}`));
    if (driver && driver !== r.drive.driver) r.log.push(logLine(`👤 ${driver}`));
    r.drive = { ...r.drive, status: remote.status, driver };
    if (remote.status === "COMPLETED") r.status = "done";
    else if (remote.status === "CANCELLED") r.status = "cancelled";
    else if (driver) r.status = "taken";
    return r;
  });
  if (res.ok) await refresh(res.ride);
  return { ok: true, message: DRIVE_STATUS_FR[remote.status] ?? remote.status };
}

async function adminAction(ref: string, user: TgUser, action: "cancel_yes" | "reopen"): Promise<Result> {
  const who = nameOf(user);
  // Course Rydar Drive : l'annulation passe d'abord par Rydar Drive.
  if (action === "cancel_yes") {
    const cur = await loadRide(ref);
    const d = cur?.ride.drive;
    if (d && !DRIVE_FINAL.has(d.status)) {
      try {
        await cancelDriveRide(d.id, `Annulée par la centrale RYDAR Privé (${who})`);
      } catch (err) {
        const msg = err instanceof DriveError ? err.message : "injoignable";
        return { ok: false, message: `Annulation refusée par Rydar Drive (${msg}). Annulez-la dans le dashboard Rydar Drive.` };
      }
    }
  }
  const res = await updateRide(ref, (r) => {
    if (action === "cancel_yes") {
      if (r.status !== "open" && r.status !== "taken") return null;
      r.status = "cancelled";
      if (r.drive) r.drive.status = "CANCELLED";
      r.log.push(logLine(`❌ Annulée par ${who}`));
    } else {
      if (r.drive || (r.status !== "taken" && r.status !== "cancelled")) return null;
      r.status = "open";
      r.log.push(logLine(`♻️ Remise en ligne par ${who}`));
      r.driver = undefined;
    }
    return r;
  });
  if (!res.ok) return { ok: false, message: "Action impossible dans l'état actuel." };
  await refresh(res.ride, { driver: true, previousDriver: res.before.driver });
  const prev = res.before.driver;
  if (prev) {
    const text =
      action === "cancel_yes"
        ? `❌ La course <code>${ref}</code> a été annulée par la centrale.`
        : `♻️ La centrale a retiré la course <code>${ref}</code> : elle est remise en ligne.`;
    await tg("sendMessage", { chat_id: prev.id, text, ...HTML }).catch(() => undefined);
  }
  return { ok: true, message: action === "cancel_yes" ? "Course annulée." : "Course remise en ligne." };
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

const isGroup = (chatId: number) => !!env.telegramChatId && String(chatId) === env.telegramChatId.trim();
const isAdminChat = (chatId: number) => !!env.telegramAdminChatId && String(chatId) === env.telegramAdminChatId.trim();

async function answer(cq: TgCallbackQuery, text: string, opts: { alert?: boolean; url?: string } = {}) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: !!opts.alert, ...(opts.url ? { url: opts.url } : {}) });
  } catch {
    /* expiré */
  }
}

async function handleCallback(cq: TgCallbackQuery) {
  const m = /^rp:([a-z_]+):([A-Z0-9-]{4,20})$/.exec(cq.data ?? "");
  const chatId = cq.message?.chat.id;
  if (!m || chatId === undefined) return answer(cq, "Action inconnue.");
  const [, action, ref] = m;

  if (action === "take") {
    if (!isGroup(chatId)) return answer(cq, "Ce groupe n'est pas la centrale configurée.", { alert: true });
    const r = await takeRide(ref, cq.from);
    if (!r.ok && r.openBot) return answer(cq, r.message, { url: `https://t.me/${await botUsername()}?start=t_${ref}` });
    return answer(cq, r.message, { alert: !r.ok });
  }

  if (action === "done" || action === "rel") {
    if (cq.message?.chat.type !== "private") return answer(cq, "Action réservée au chauffeur, en privé.");
    const r = await driverAction(ref, cq.from, action);
    return answer(cq, r.message, { alert: !r.ok });
  }

  if (!isAdminChat(chatId)) return answer(cq, "Réservé à l'admin.", { alert: true });
  if (action === "cancel" || action === "cancel_no") {
    const cur = await loadRide(ref);
    if (!cur) return answer(cq, "Course introuvable.");
    await tg("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cq.message!.message_id,
      reply_markup: adminKeyboard(cur.ride, action === "cancel"),
    }).catch(() => undefined);
    return answer(cq, action === "cancel" ? "Confirmer l'annulation ?" : "OK");
  }
  if (action === "cancel_yes" || action === "reopen") {
    const r = await adminAction(ref, cq.from, action);
    return answer(cq, r.message, { alert: !r.ok });
  }
  if (action === "drv") {
    const r = await refreshDrive(ref);
    return answer(cq, r.message, { alert: !r.ok });
  }
  return answer(cq, "Action inconnue.");
}

async function reply(chatId: number, html: string, threadId?: number) {
  await tg("sendMessage", { chat_id: chatId, text: html, ...HTML, ...(threadId ? { message_thread_id: threadId } : {}) });
}

function chatIdHelp(chatId: number, isPrivate: boolean) {
  return [
    "👋 <b>Bot RYDAR Privé</b>",
    `ID de cette discussion : <code>${chatId}</code>`,
    "",
    isPrivate
      ? "Pour recevoir ici les fiches admin (prix client, commission, historique), mettez cette valeur dans <code>TELEGRAM_ADMIN_CHAT_ID</code>."
      : "Pour en faire le groupe des chauffeurs, mettez cette valeur dans <code>TELEGRAM_CHAT_ID</code>.",
  ].join("\n");
}

const STATUS_ICON: Record<Ride["status"], string> = { open: "🟡", taken: "🟢", done: "🏁", cancelled: "❌" };

async function listCourses(chatId: number) {
  const rides = await recentRides(15);
  if (!rides.length) return reply(chatId, "Aucune course enregistrée pour l'instant.");
  const lines = rides.map((r) => {
    const b = r.booking;
    const dest = b.dropoff ? shortPlace(b.dropoff) : `MAD ${b.hours}H`;
    const icon = r.drive ? (DRIVE_STATUS_FR[r.drive.status]?.split(" ")[0] ?? "🚀") : STATUS_ICON[r.status];
    return `${icon} <code>${b.ref}</code> ${escapeHtml(shortDate(b.date))} ${b.time} · ${escapeHtml(shortPlace(b.pickup))} ➜ ${escapeHtml(dest)}${r.driver ? ` · ${escapeHtml(r.driver.name)}` : r.drive?.driver ? ` · ${escapeHtml(r.drive.driver)}` : ""}`;
  });
  return reply(chatId, ["<b>Dernières courses</b>", "🟡 en attente · 🟢 attribuée · 🏁 terminée · ❌ annulée", "", ...lines].join("\n"));
}

export async function handleTelegramUpdate(update: TgUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);

  const mcm = update.my_chat_member;
  if (mcm && (mcm.chat.type === "group" || mcm.chat.type === "supergroup")) {
    const st = mcm.new_chat_member.status;
    if ((st === "member" || st === "administrator") && !isGroup(mcm.chat.id)) await reply(mcm.chat.id, chatIdHelp(mcm.chat.id, false));
    return;
  }

  const msg = update.message;
  const text = msg?.text?.trim() ?? "";
  if (!msg || !text.startsWith("/")) return;
  const [rawCmd, arg] = text.split(/\s+/, 2);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const isPrivate = msg.chat.type === "private";

  if (cmd === "/id" || cmd === "/chatid") return reply(msg.chat.id, chatIdHelp(msg.chat.id, isPrivate), msg.message_thread_id);

  if (cmd === "/courses" && (isAdminChat(msg.chat.id) || isGroup(msg.chat.id))) return listCourses(msg.chat.id);

  if (cmd === "/start" && isPrivate && msg.from) {
    const take = /^t_([A-Z0-9-]{4,20})$/.exec(arg ?? "");
    if (take) {
      const r = await takeRide(take[1], msg.from);
      if (!r.ok) return reply(msg.chat.id, escapeHtml(r.message));
      return;
    }
    return reply(
      msg.chat.id,
      `👋 Bonjour ${escapeHtml(nameOf(msg.from))} ! Je suis le bot de la centrale <b>RYDAR Privé</b>.\nQuand tu appuies sur « ✋ JE PRENDS » dans le groupe, tu reçois ici les détails de la course (client, adresses, téléphone).\n\n<i>${parisClock()}</i>`,
    );
  }
}
