import "server-only";
import { z } from "zod";
import { getTelegramConfig } from "@/lib/config/telegram";

export const TELEGRAM_FETCH_TIMEOUT_MS = 4_000;
const keyboardSchema = z.object({ inline_keyboard: z.array(z.array(z.object({
  text: z.string().min(1).max(80),
  callback_data: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 64),
}).strict()).max(4)).max(4) }).strict();
export type TelegramKeyboard = z.infer<typeof keyboardSchema>;

// No raw fetch/Telegram errors escape: they may contain the token-bearing URL.
export class TelegramTransportError extends Error {
  constructor(public readonly retryable: boolean) { super("TELEGRAM_DELIVERY_FAILED"); }
}

async function callTelegram(method: "sendMessage" | "answerCallbackQuery", payload: unknown): Promise<void> {
  const { botToken } = getTelegramConfig(process.env);
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS), cache: "no-store", redirect: "error",
    });
    const result = z.object({ ok: z.boolean(), error_code: z.number().int().optional() }).safeParse(await response.json());
    if (!result.success) throw new TelegramTransportError(true);
    if (!response.ok || !result.data.ok) {
      const code = result.data.error_code ?? response.status;
      // Only explicit permanent request/chat rejections stop delivery retries.
      // An invalid token/configuration or unexpected upstream response can be
      // repaired; acknowledging it as DONE would silently lose the update.
      throw new TelegramTransportError(code !== 400 && code !== 403);
    }
  } catch (error) {
    if (error instanceof TelegramTransportError) throw error;
    throw new TelegramTransportError(true);
  }
}

export async function sendMessage(chatId: string, text: string, replyMarkup?: TelegramKeyboard): Promise<void> {
  z.string().regex(/^\d{1,20}$/).parse(chatId);
  z.string().min(1).max(4096).parse(text);
  if (replyMarkup) keyboardSchema.parse(replyMarkup);
  await callTelegram("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  z.string().min(1).max(200).parse(id);
  if (text !== undefined) z.string().max(200).parse(text);
  await callTelegram("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}
