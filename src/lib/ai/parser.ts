import "server-only";
import { AI_TIMEOUT_MS, getAiConfig } from "@/lib/config/ai";
import { consumeTelegramAiAttempt } from "@/lib/telegram/dal";
import type { ParseResult, TelegramCategory } from "@/lib/telegram/parser";
import { interpretChat } from "./chat";
import { deepseekProvider } from "./provider";
import { genericCategoryNames, prepareAiInput } from "./input";

export async function interpretTelegramWithAi(
  userId: string, sender: string, connectionId: string, message: string, categories: TelegramCategory[],
  fallback: ParseResult, now: Date, onDispatch?: () => Promise<unknown>,
) {
  const config = getAiConfig(process.env);
  if (fallback.kind === "PROPOSAL" || (fallback.kind === "CLARIFICATION" && fallback.payload.field !== "category") || !config) return null;
  const input = prepareAiInput(message, categories);
  if (!input) return null;
  // Reserve and recheck consent on the original connection without holding
  // a database lock during the network request.
  try {
    if (!await consumeTelegramAiAttempt(userId, sender, config.AI_MINUTE_LIMIT_PER_USER, config.AI_DAILY_LIMIT_PER_USER, connectionId)) return null;
  } catch { return null; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, AI_TIMEOUT_MS);
    });
    // Absorb provider failures while delivering processing feedback. Telegram
    // delivery errors still propagate to the webhook retry.
    const result = Promise.race([
      deepseekProvider(config.DEEPSEEK_API_KEY).parse({ message: input.message, categoryNames: genericCategoryNames }, controller.signal),
      deadline,
    ]).then((raw) => interpretChat(raw, input, message, categories, now,
      fallback.kind === "CLARIFICATION" ? fallback.payload.transactions : undefined)).catch(() => null);
    await onDispatch?.();
    return await result;
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}
