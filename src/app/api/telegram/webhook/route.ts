import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getTelegramConfig, isTelegramConfigured } from "@/lib/config/telegram";
import { telegramUpdateSchema, isPrivateTelegramUpdate } from "@/lib/telegram/update";
import { claimTelegramUpdate, cleanupTelegramState, finishTelegramUpdate } from "@/lib/telegram/state";
import { processTelegramUpdate } from "@/lib/telegram/processor";
import { answerCallbackQuery, TelegramTransportError } from "@/lib/telegram/transport";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_BODY_BYTES = 64 * 1024;

function secretMatches(supplied: string | null, expected: string): boolean {
  // Hash both to fixed-size buffers before a constant-time comparison, including unequal lengths.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied ?? ""), digest(expected));
}

async function boundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new Error("INVALID_BODY");
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("INVALID_BODY"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } finally { reader.releaseLock(); }
}

const ok = () => new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  // Authenticate before touching the request body or database.
  if (!isTelegramConfigured(process.env)) return new Response(null, { status: 503 });
  const { webhookSecret } = getTelegramConfig(process.env);
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) return new Response(null, { status: 401 });
  let raw: unknown;
  try { raw = await boundedJson(request); } catch { return ok(); }
  const parsed = telegramUpdateSchema.safeParse(raw);
  if (!parsed.success) return ok();
  const update = parsed.data;
  if (!isPrivateTelegramUpdate(update)) {
    if (update.callback_query) {
      try { await answerCallbackQuery(update.callback_query.id, "Gunakan sembang peribadi dengan bot."); } catch { /* Ignored update, never expose data. */ }
    }
    return ok();
  }
  let lease: Awaited<ReturnType<typeof claimTelegramUpdate>> = null;
  try {
    lease = await claimTelegramUpdate(update.update_id);
    if (!lease) return ok();
    // Deterministic intake plus optional AI has a five-second AI deadline. Keep
    // HTTP delivery retryable until processing succeeds; an early200 loses work
    // if a post-response invocation dies. The processor gives immediate chat
    // feedback after checking the linked identity instead.
    await processTelegramUpdate(update);
    if (!await finishTelegramUpdate(lease, "DONE")) throw new Error("TELEGRAM_LEASE_LOST");
  } catch (error) {
    if (lease && error instanceof TelegramTransportError && !error.retryable) {
      // For example, a user blocked the bot: retrying cannot deliver the reply.
      try { if (!await finishTelegramUpdate(lease, "DONE")) return new Response(null, { status: 503 }); } catch { return new Response(null, { status: 503 }); }
      return ok();
    }
    if (lease) {
      try { await finishTelegramUpdate(lease, "FAILED"); } catch { /* A stale lock remains reclaimable on retry. */ }
    }
    return new Response(null, { status: 503, headers: { "Retry-After": "2", "Cache-Control": "no-store" } });
  }
  // Failure here is housekeeping only; it cannot change successful delivery.
  after(async () => { try { await cleanupTelegramState(); } catch { /* No raw messages or secrets in logs. */ } });
  return ok();
}
