export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TgUser;
  language?: string;
}

export interface TgInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  entities?: TgEntity[];
  reply_markup?: { inline_keyboard: TgInlineButton[][] };
  new_chat_members?: TgUser[];
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  new_chat_member: { status: string; user: TgUser };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgChatMemberUpdated;
}
