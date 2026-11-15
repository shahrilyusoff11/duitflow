import { z } from "zod";

const identifier = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const chat = z.object({ id: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), type: z.enum(["private", "group", "supergroup", "channel"]) });
const sender = z.object({ id: identifier, is_bot: z.boolean() });

// Strip Telegram's unrelated fields; never persist names, usernames, or the raw update.
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: z.object({ message_id: identifier, date: z.number().int().optional(), from: sender, chat, text: z.string().max(4096).optional() }).optional(),
  callback_query: z.object({
    id: z.string().min(1).max(200), from: sender,
    // Invalid callback data still reaches the processor so it can stop the spinner.
    data: z.string().max(4096).optional(),
    message: z.object({ message_id: z.number().int().nonnegative(), chat }).optional(),
  }).optional(),
}).refine((update) => !(update.message && update.callback_query));

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export function isPrivateTelegramUpdate(update: TelegramUpdate): boolean {
  if (update.callback_query) {
    const callback = update.callback_query;
    return !callback.from.is_bot && callback.message?.chat.type === "private" && callback.message.chat.id === callback.from.id;
  }
  return !!update.message && !update.message.from.is_bot && update.message.chat.type === "private" && update.message.chat.id === update.message.from.id;
}
