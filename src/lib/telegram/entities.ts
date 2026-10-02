import type { TgEntity } from "@/lib/telegram/types";

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function openTag(e: TgEntity): string {
  switch (e.type) {
    case "bold":
      return "<b>";
    case "italic":
      return "<i>";
    case "underline":
      return "<u>";
    case "strikethrough":
      return "<s>";
    case "spoiler":
      return "<tg-spoiler>";
    case "code":
      return "<code>";
    case "pre":
      return e.language ? `<pre><code class="language-${escapeHtml(e.language)}">` : "<pre>";
    case "blockquote":
      return "<blockquote>";
    case "expandable_blockquote":
      return "<blockquote expandable>";
    case "text_link":
      return `<a href="${escapeHtml(e.url ?? "")}">`;
    case "text_mention":
      return e.user ? `<a href="tg://user?id=${e.user.id}">` : "";
    default:
      return "";
  }
}

function closeTag(e: TgEntity): string {
  switch (e.type) {
    case "bold":
      return "</b>";
    case "italic":
      return "</i>";
    case "underline":
      return "</u>";
    case "strikethrough":
      return "</s>";
    case "spoiler":
      return "</tg-spoiler>";
    case "code":
      return "</code>";
    case "pre":
      return e.language ? "</code></pre>" : "</pre>";
    case "blockquote":
    case "expandable_blockquote":
      return "</blockquote>";
    case "text_link":
      return "</a>";
    case "text_mention":
      return e.user ? "</a>" : "";
    default:
      return "";
  }
}

/**
 * Reconstruit le HTML d'un message Telegram à partir de son texte et de ses entités
 * (les offsets Telegram sont en unités UTF-16, comme les index des chaînes JS).
 */
export function entitiesToHtml(text: string, entities: TgEntity[] = []): string {
  const sorted = entities
    .filter((e) => openTag(e) !== "")
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.offset - b.e.offset || b.e.length - a.e.length || a.i - b.i)
    .map(({ e }) => e);
  const opens = new Map<number, TgEntity[]>();
  for (const e of sorted) {
    const list = opens.get(e.offset) ?? [];
    list.push(e);
    opens.set(e.offset, list);
  }
  let out = "";
  const stack: TgEntity[] = [];
  for (let pos = 0; pos <= text.length; pos++) {
    // Fermer les entités qui se terminent ici (ordre inverse d'ouverture).
    for (let k = stack.length - 1; k >= 0; k--) {
      const e = stack[k];
      if (e.offset + e.length === pos) {
        out += closeTag(e);
        stack.splice(k, 1);
      }
    }
    for (const e of opens.get(pos) ?? []) {
      if (e.length <= 0) continue;
      out += openTag(e);
      stack.push(e);
    }
    if (pos < text.length) out += escapeHtml(text[pos]);
  }
  for (let k = stack.length - 1; k >= 0; k--) out += closeTag(stack[k]);
  return out;
}
