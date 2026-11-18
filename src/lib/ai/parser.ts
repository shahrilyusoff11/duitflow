import "server-only";
import { AI_TIMEOUT_MS, getAiConfig } from "@/lib/config/ai";
import { consumeTelegramAiAttempt } from "@/lib/telegram/dal";
import { parseTelegramText, type TelegramCategory } from "@/lib/telegram/parser";
import { interpretAiOutput, type AiInterpretation } from "./interpret";
import { deepseekProvider } from "./provider";
import { genericCategoryNames, prepareAiInput } from "./input";
import { parseFinanceQuestion } from "./question";

export async function parseWithAi(userId: string, sender: string, message: string, categories: TelegramCategory[], now = new Date()): Promise<AiInterpretation> {
  const query = parseFinanceQuestion(message, categories);
  if (query) return { kind: "QUERY", query };
  const fallback = parseTelegramText(message, categories, now);
  const config = getAiConfig(process.env);
  if (fallback.kind === "PROPOSAL" || (fallback.kind === "CLARIFICATION" && fallback.payload.field !== "category") || !config) return fallback;
  const input = prepareAiInput(message);
  if (!input) return fallback;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    // Authorization, current consent and shared quotas are rechecked atomically
    // immediately before dispatch, without holding a DB lock during the network.
    if (!await consumeTelegramAiAttempt(userId, sender, config.AI_MINUTE_LIMIT_PER_USER, config.AI_DAILY_LIMIT_PER_USER)) return fallback;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, AI_TIMEOUT_MS);
    });
    const raw = await Promise.race([
      deepseekProvider(config.DEEPSEEK_API_KEY).parse({ message: input.message, categoryNames: genericCategoryNames }, controller.signal), deadline,
    ]);
    return interpretAiOutput(raw, input.items, categories, now);
  } catch { return fallback; }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
