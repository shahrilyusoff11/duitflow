import { z } from "zod";

// Reviewed against Google's free-tier pricing on 15 November 2026. No aliases,
// arbitrary URLs, paid-model failover or automatic model upgrades.
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const AI_TIMEOUT_MS = 5_000;
export const aiEnvironmentSchema = z.object({
  AI_PROVIDER: z.enum(["deterministic", "gemini"]).default("deterministic"),
  GEMINI_API_KEY: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  GEMINI_MODEL: z.literal(GEMINI_MODEL).default(GEMINI_MODEL),
  GEMINI_FREE_TIER_CONFIRMED: z.enum(["yes", "no"]).default("no"),
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
    return config.AI_PROVIDER === "gemini" && config.GEMINI_API_KEY && config.GEMINI_FREE_TIER_CONFIRMED === "yes" ? config : null;
  } catch { return null; } // Missing/invalid optional AI config never breaks finance.
}
