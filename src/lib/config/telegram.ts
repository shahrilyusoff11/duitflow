import { z } from "zod";

const botUsername = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/);
const environmentSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  TELEGRAM_BOT_USERNAME: botUsername,
});

export function getTelegramConfig(environment: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) throw new Error("Telegram configuration is missing or invalid.");
  return { botToken: result.data.TELEGRAM_BOT_TOKEN, webhookSecret: result.data.TELEGRAM_WEBHOOK_SECRET, botUsername: result.data.TELEGRAM_BOT_USERNAME };
}

export function isTelegramConfigured(environment: Record<string, string | undefined>): boolean {
  return environmentSchema.safeParse(environment).success;
}

export function telegramBotUsername(environment: Record<string, string | undefined>): string | null {
  const result = botUsername.safeParse(environment.TELEGRAM_BOT_USERNAME);
  return result.success ? result.data : null;
}
