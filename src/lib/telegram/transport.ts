import "server-only";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { z } from "zod";
import { getTelegramConfig } from "@/lib/config/telegram";

export const TELEGRAM_FETCH_TIMEOUT_MS = 4_000;
const MAX_TELEGRAM_RESPONSE_BYTES = 64 * 1024;
const keyboardSchema = z.object({ inline_keyboard: z.array(z.array(z.object({
  text: z.string().min(1).max(80),
  callback_data: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 64),
}).strict()).max(4)).max(4) }).strict();
export type TelegramKeyboard = z.infer<typeof keyboardSchema>;

// No raw transport errors escape: they may contain the token-bearing path.
export class TelegramTransportError extends Error {
  constructor(public readonly retryable: boolean, public readonly retryAfterSeconds?: number) { super("TELEGRAM_DELIVERY_FAILED"); }
}

async function callTelegram(method: "sendMessage" | "answerCallbackQuery", payload: unknown): Promise<void> {
  const { botToken } = getTelegramConfig(process.env);
  try {
    const body = Buffer.from(JSON.stringify(payload));
    // Avoid the Next.js fetch wrapper, which can record the entire URL in spans.
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const outgoing = request({
        hostname: "api.telegram.org",
        path: `/bot${botToken}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": body.length, "Cache-Control": "no-store" },
        signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
      }, resolve);
      outgoing.on("error", reject);
      outgoing.end(body);
    });
    const status = response.statusCode ?? 0;
    if ((status >= 300 && status < 400) || Number(response.headers["content-length"]) > MAX_TELEGRAM_RESPONSE_BYTES) {
      response.destroy();
      throw new TelegramTransportError(true);
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_TELEGRAM_RESPONSE_BYTES) throw new TelegramTransportError(true);
      chunks.push(buffer);
    }
    const result = z.object({
      ok: z.boolean(), error_code: z.number().int().optional(),
      parameters: z.object({ retry_after: z.number().int().positive().max(86_400_000).optional() }).optional(),
    }).safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!result.success) throw new TelegramTransportError(true);
    if (status !== 200 || !result.data.ok) {
      const code = result.data.error_code ?? status;
      // Only explicit permanent request/chat rejections stop delivery retries.
      // An invalid token/configuration or unexpected upstream response can be
      // repaired; acknowledging it as DONE would silently lose the update.
      const retryAfter = status === 429 && !result.data.ok && code === 429 ? result.data.parameters?.retry_after ?? 60 : undefined;
      throw new TelegramTransportError(code !== 400 && code !== 403, retryAfter);
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
  await callTelegram("sendMessage", { chat_id: chatId, text, protect_content: true, link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  z.string().min(1).max(200).parse(id);
  if (text !== undefined) z.string().max(200).parse(text);
  await callTelegram("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}
