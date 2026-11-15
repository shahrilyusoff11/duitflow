import "server-only";
import { AI_TIMEOUT_MS, getAiConfig } from "@/lib/config/ai";
import { todayInMalaysia } from "@/lib/finance/dates";
import { consumeTelegramAiAttempt } from "@/lib/telegram/dal";
import { parseTelegramText, type TelegramCategory } from "@/lib/telegram/parser";
import { interpretAiOutput, type AiInterpretation } from "./interpret";
import { geminiProvider } from "./provider";

export async function parseWithAi(userId: string, sender: string, message: string, categories: TelegramCategory[], now = new Date()): Promise<AiInterpretation> {
  const fallback = () => parseTelegramText(message, categories, now);
  const config = getAiConfig(process.env);
  if (!config || categories.length > 100 || !message.trim() || message.length > 4000 || /^(ya|yes|ok|sahkan)$/i.test(message.trim()) || /\b(abaikan arahan|ignore (?:all |previous |prior )?instructions|skip confirmation|tanpa pengesahan|select\s+.+\s+from|drop table)\b/i.test(message)) return fallback();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    // Authorization, current consent and shared quotas are rechecked atomically
    // immediately before dispatch, without holding a DB lock during the network.
    if (!await consumeTelegramAiAttempt(userId, sender, config.AI_MINUTE_LIMIT_PER_USER, config.AI_DAILY_LIMIT_PER_USER)) return fallback();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, AI_TIMEOUT_MS);
    });
    const raw = await Promise.race([
      geminiProvider(config.GEMINI_API_KEY!).parse({ message, today: todayInMalaysia(now), categoryNames: categories.map((item) => item.name) }, controller.signal), deadline,
    ]);
    return interpretAiOutput(raw, message, categories, now);
  } catch { return fallback(); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}
