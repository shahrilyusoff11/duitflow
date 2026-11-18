import { z } from "zod";

export const DEEPSEEK_MODEL = "deepseek-flash";
export const AI_TIMEOUT_MS = 5_000;
export const aiEnvironmentSchema = z.object({
  AI_PROVIDER: z.enum(["deterministic", "deepseek"]).default("deterministic"),
  DEEPSEEK_API_KEY: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  DEEPSEEK_MODEL: z.literal(DEEPSEEK_MODEL).default(DEEPSEEK_MODEL),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).max(30).default(30),
  AI_MINUTE_LIMIT_PER_USER: z.coerce.number().int().min(1).max(2).default(2),
});

export function readAiEnvironment(environment: Record<string, string | undefined>) {
  const parsed = aiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error("AI configuration is invalid. Check docs/AI_SETUP.md.");
  return parsed.data;
}

export function getAiConfig(environment: Record<string, string | undefined>) {
  try {
    const config = readAiEnvironment(environment);
    if (config.AI_PROVIDER !== "deepseek" || !config.DEEPSEEK_API_KEY) return null;
    return { ...config, DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY };
  } catch { return null; } // Missing/invalid optional AI config never breaks finance.
}
