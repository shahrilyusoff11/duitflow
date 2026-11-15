import "server-only";
import { getDatabase } from "@/lib/db";

// Longer than the entire webhook invocation (30s), not just a network call.
export const TELEGRAM_LEASE_MS = 60_000;
export type TelegramLease = { updateId: bigint; attempt: number; lockedAt: Date };
export class TelegramUpdateBusyError extends Error {
  constructor() { super("TELEGRAM_UPDATE_BUSY"); }
}

export async function claimTelegramUpdate(updateId: number, now = new Date()): Promise<TelegramLease | null> {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error("INVALID_TELEGRAM_UPDATE_ID");
  const id = BigInt(updateId);
  return getDatabase().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-update:${id}`}, 0))::text`;
    const row = await tx.telegramUpdate.findUnique({ where: { telegramUpdateId: id } });
    if (!row) {
      await tx.telegramUpdate.create({ data: { telegramUpdateId: id, status: "PROCESSING", attempts: 1, lockedAt: now } });
      return { updateId: id, attempt: 1, lockedAt: now };
    }
    if (row.status === "DONE") return null;
    // Do not process a live lease twice. Keep delivery retryable as well: a200
    // here could permanently acknowledge an update whose original worker dies.
    if (row.status === "PROCESSING" && row.lockedAt && row.lockedAt.getTime() > now.getTime() - TELEGRAM_LEASE_MS) throw new TelegramUpdateBusyError();
    const attempt = row.attempts + 1;
    await tx.telegramUpdate.update({ where: { telegramUpdateId: id }, data: { status: "PROCESSING", attempts: attempt, lockedAt: now } });
    return { updateId: id, attempt, lockedAt: now };
  });
}

export async function finishTelegramUpdate(lease: TelegramLease, status: "DONE" | "FAILED"): Promise<boolean> {
  // A timed-out worker cannot finish or fail the lease subsequently reclaimed by a retry.
  const result = await getDatabase().telegramUpdate.updateMany({ where: {
    telegramUpdateId: lease.updateId, status: "PROCESSING", attempts: lease.attempt, lockedAt: lease.lockedAt,
  }, data: { status, lockedAt: null } });
  return result.count === 1;
}

export async function cleanupTelegramState(): Promise<void> {
  const database = getDatabase();
  // Keep processing/failed updates for retries. Delete in bounded batches, without cron.
  await database.$executeRaw`DELETE FROM "TelegramUpdate" WHERE "telegramUpdateId" IN (
    SELECT "telegramUpdateId" FROM "TelegramUpdate" WHERE "status" = 'DONE' AND "updatedAt" < now() - interval '7 days' LIMIT 100
  )`;
  await database.$executeRaw`DELETE FROM "TelegramLinkToken" WHERE "id" IN (
    SELECT "id" FROM "TelegramLinkToken" WHERE "expiresAt" < now() - interval '1 day' LIMIT 100
  )`;
  await database.$executeRaw`DELETE FROM "PendingTelegramAction" WHERE "id" IN (
    SELECT "id" FROM "PendingTelegramAction" WHERE "expiresAt" < now() - interval '7 days' LIMIT 100
  )`;
}
