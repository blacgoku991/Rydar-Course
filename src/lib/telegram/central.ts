import "server-only";
import { env } from "@/lib/env";
import { kv } from "@/lib/store";
import { sendToCentral, tg, TelegramError } from "@/lib/telegram/api";
import { entitiesToHtml, escapeHtml } from "@/lib/telegram/entities";
import {
  bookingMessageHtml,
  keyboardFor,
  parisClock,
  routeUrl,
  statusFromText,
  statusHeader,
  userLink,
  whatsappUrl,
  type CentralStatus,
  type LinkButtons,
} from "@/lib/telegram/format";
import type { TgCallbackQuery, TgEntity, TgMessage, TgUpdate, TgUser } from "@/lib/telegram/types";
import type { Booking } from "@/lib/types";

const LOCK_TTL = 60 * 60 * 24 * 120;

/** Publie une réservation dans le groupe centrale. Retourne l'id du message. */
export async function postBookingToCentral(b: Booking, opts: { test?: boolean } = {}) {
  const links: LinkButtons = { route: routeUrl(b), whatsapp: whatsappUrl(b.customer.phone) };
  const msg = await sendToCentral<TgMessage>({
    text: bookingMessageHtml(b, opts),
    parse_mode: "HTML",
    reply_markup: keyboardFor("new", b.ref, links),
    link_preview_options: { is_disabled: true },
  });
  return msg.message_id;
}

/** Message libre dans la centrale (récapitulatif d'appel, alertes…). */
export async function notifyCentral(html: string) {
  return sendToCentral<TgMessage>({ text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

function displayName(u: TgUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Chauffeur";
}

function sameChat(chatId: number) {
  const configured = env.telegramChatId;
  return !!configured && String(chatId) === configured.trim();
}

async function isAdmin(chatId: number, user: TgUser) {
  if (env.telegramAdminIds.includes(String(user.id))) return true;
  try {
    const member = await tg<{ status: string }>("getChatMember", { chat_id: chatId, user_id: user.id });
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

function linksFromMarkup(msg: TgMessage): LinkButtons {
  const links: LinkButtons = {};
  for (const row of msg.reply_markup?.inline_keyboard ?? []) {
    for (const b of row) {
      if (!b.url) continue;
      if (b.url.includes("wa.me")) links.whatsapp = b.url;
      else links.route = b.url;
    }
  }
  return links;
}

/** Identifiant Telegram du chauffeur, lu dans la première ligne du message. */
export function takerIdFrom(text: string, entities: TgEntity[] = []): number | null {
  const firstLen = (text.split("\n", 1)[0] ?? "").length;
  for (const e of entities) {
    if (e.offset >= firstLen) continue;
    if (e.type === "text_mention" && e.user) return e.user.id;
    if (e.type === "text_link" && e.url?.startsWith("tg://user?id=")) return Number(e.url.slice(13)) || null;
  }
  const m = /#(\d{5,})/.exec(text.slice(0, firstLen));
  return m ? Number(m[1]) : null;
}

async function answer(cq: TgCallbackQuery, text: string, alert = false) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  } catch {
    /* expiré */
  }
}

async function edit(msg: TgMessage, html: string, markup: ReturnType<typeof keyboardFor>, fallbackHtml?: string) {
  const payload = {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    parse_mode: "HTML",
    reply_markup: markup,
    link_preview_options: { is_disabled: true },
  };
  try {
    await tg("editMessageText", { ...payload, text: html });
  } catch (err) {
    if (err instanceof TelegramError && /not modified/i.test(err.message)) return;
    if (fallbackHtml) {
      await tg("editMessageText", { ...payload, text: fallbackHtml });
      return;
    }
    throw err;
  }
}

function rebuild(msg: TgMessage, header: string, journal: string) {
  const html = entitiesToHtml(msg.text ?? "", msg.entities ?? []);
  const nl = html.indexOf("\n");
  const body = nl >= 0 ? html.slice(nl) : "";
  return `${header}${body}\n• ${parisClock()} ${journal}`;
}

/** En-tête avec mention ; variante sans lien si Telegram refuse la mention. */
function headers(status: CentralStatus, actor: TgUser) {
  const withLink = statusHeader(status, actor);
  const plain = withLink.replace(userLink(actor), `${escapeHtml(displayName(actor))} <code>#${actor.id}</code>`);
  return { withLink, plain };
}

async function handleCallback(cq: TgCallbackQuery) {
  const msg = cq.message;
  const m = /^rp:([a-z_]+):([A-Z0-9-]{4,20})$/.exec(cq.data ?? "");
  if (!msg || !m) return answer(cq, "Action inconnue.");
  if (!sameChat(msg.chat.id)) return answer(cq, "Ce groupe n'est pas la centrale configurée.", true);
  const [, action, ref] = m;
  const text = msg.text ?? "";
  if (!text.includes(ref)) return answer(cq, "Message introuvable.");
  const status = statusFromText(text);
  const links = linksFromMarkup(msg);
  const from = cq.from;
  const name = escapeHtml(displayName(from));
  const lockKey = `take:${ref}`;

  switch (action) {
    case "take": {
      if (status !== "new") return answer(cq, "Cette course est déjà attribuée.", true);
      const locked = await kv().setNX(lockKey, String(from.id), LOCK_TTL);
      if (!locked) {
        const holder = await kv().get(lockKey);
        if (holder !== String(from.id)) return answer(cq, "Trop tard : un autre chauffeur vient de la prendre.", true);
      }
      const h = headers("taken", from);
      await edit(msg, rebuild(msg, h.withLink, `✅ Prise par ${name}`), keyboardFor("taken", ref, links), rebuild(msg, h.plain, `✅ Prise par ${name}`));
      await answer(cq, "✅ Course attribuée. Bonne route !");
      await sendDriverCopy(from, msg);
      return;
    }
    case "release":
    case "done": {
      if (status !== "taken") return answer(cq, "Action impossible dans l'état actuel.", true);
      const taker = takerIdFrom(text, msg.entities);
      if (taker !== from.id && !(await isAdmin(msg.chat.id, from))) {
        return answer(cq, "Seul le chauffeur attribué ou un admin peut faire ça.", true);
      }
      if (action === "release") {
        await kv().del(lockKey);
        await edit(msg, rebuild(msg, statusHeader("new"), `↩️ Libérée par ${name}`), keyboardFor("new", ref, links));
        return answer(cq, "Course remise à disposition.");
      }
      const firstLine = entitiesToHtml(text, msg.entities).split("\n", 1)[0] ?? "";
      const doneHeader = firstLine.replace(/^✅ <b>ATTRIBUÉE<\/b>/, "🏁 <b>TERMINÉE</b>");
      await edit(msg, rebuild(msg, doneHeader, `🏁 Terminée (${name})`), keyboardFor("done", ref, links));
      return answer(cq, "🏁 Course terminée. Merci !");
    }
    case "cancel": {
      if (status !== "new" && status !== "taken") return answer(cq, "Action impossible.");
      if (!(await isAdmin(msg.chat.id, from))) return answer(cq, "Seuls les admins de la centrale peuvent annuler.", true);
      await tg("editMessageReplyMarkup", { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: keyboardFor("confirm_cancel", ref, links) });
      return answer(cq, "Confirmez l'annulation.");
    }
    case "cancel_no": {
      const back = status === "taken" ? "taken" : status === "new" ? "new" : null;
      if (back) await tg("editMessageReplyMarkup", { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: keyboardFor(back, ref, links) });
      return answer(cq, "OK");
    }
    case "cancel_yes": {
      if (status !== "new" && status !== "taken") return answer(cq, "Action impossible.");
      if (!(await isAdmin(msg.chat.id, from))) return answer(cq, "Seuls les admins de la centrale peuvent annuler.", true);
      await kv().del(lockKey);
      const h = headers("cancelled", from);
      await edit(
        msg,
        rebuild(msg, h.withLink, `❌ Annulée par ${name}`),
        keyboardFor("cancelled", ref, links),
        rebuild(msg, h.plain, `❌ Annulée par ${name}`),
      );
      return answer(cq, "Course annulée.");
    }
    case "restore": {
      if (status !== "cancelled") return answer(cq, "Action impossible.");
      if (!(await isAdmin(msg.chat.id, from))) return answer(cq, "Réservé aux admins.", true);
      await edit(msg, rebuild(msg, statusHeader("new"), `♻️ Rétablie par ${name}`), keyboardFor("new", ref, links));
      return answer(cq, "Course remise en ligne.");
    }
    default:
      return answer(cq, "Action inconnue.");
  }
}

/** Copie privée de la course au chauffeur (si celui-ci a démarré le bot). */
async function sendDriverCopy(driver: TgUser, msg: TgMessage) {
  try {
    const html = entitiesToHtml(msg.text ?? "", msg.entities ?? []);
    const nl = html.indexOf("\n");
    const journal = html.lastIndexOf("\n<i>Journal</i>");
    const body = html.slice(nl + 1, journal > nl ? journal : undefined);
    await tg("sendMessage", {
      chat_id: driver.id,
      text: `✅ <b>Course attribuée</b>\n${body}`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          Object.entries(linksFromMarkup(msg)).map(([k, url]) => ({ text: k === "route" ? "🗺 Itinéraire" : "💬 WhatsApp client", url })),
        ].filter((r) => r.length),
      },
    });
  } catch {
    // Le chauffeur n'a pas démarré le bot en privé : rien de grave.
  }
}

async function reply(chatId: number, html: string, threadId?: number) {
  await tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", ...(threadId ? { message_thread_id: threadId } : {}) });
}

function chatIdHelp(chatId: number) {
  return [
    "👋 <b>Bot RYDAR Privé</b>",
    `ID de cette discussion : <code>${chatId}</code>`,
    "",
    "Pour en faire votre centrale, mettez cette valeur dans la variable <code>TELEGRAM_CHAT_ID</code> (Vercel → Settings → Environment Variables), puis redéployez.",
  ].join("\n");
}

export async function handleTelegramUpdate(update: TgUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);

  const mcm = update.my_chat_member;
  if (mcm && (mcm.chat.type === "group" || mcm.chat.type === "supergroup")) {
    const st = mcm.new_chat_member.status;
    if ((st === "member" || st === "administrator") && !sameChat(mcm.chat.id)) await reply(mcm.chat.id, chatIdHelp(mcm.chat.id));
    return;
  }

  const msg = update.message;
  const cmd = msg?.text?.trim().split(/\s|@/, 1)[0]?.toLowerCase();
  if (!msg || !cmd) return;
  if (cmd === "/id" || cmd === "/chatid") return reply(msg.chat.id, chatIdHelp(msg.chat.id), msg.message_thread_id);
  if (cmd === "/start" && msg.chat.type === "private") {
    return reply(
      msg.chat.id,
      "👋 Bonjour ! Je suis le bot de la centrale <b>RYDAR Privé</b>.\nQuand vous prenez une course dans le groupe, vous en recevez ici une copie privée.",
    );
  }
}
