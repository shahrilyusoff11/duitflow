import "server-only";
import { createHmac } from "node:crypto";
import { getDatabase } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Longer than the entire webhook invocation (30s), not just a network call.
export const TELEGRAM_LEASE_MS = 60_000;
export type TelegramLease = { updateId: bigint; attempt: number; lockedAt: Date };
export class TelegramUpdateBusyError extends Error {
  constructor() { super("TELEGRAM_UPDATE_BUSY"); }
}

type Ingress = { sender: string; kind: "message" | "callback" | "link"; secret: string };
const ingressLimits = { message: [12, 120], callback: [12, 120], link: [5, 60] } as const;

async function reserveIngress(tx: Prisma.TransactionClient, { sender, kind, secret }: Ingress, now: Date) {
  const bucket = `telegram:${kind}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bucket}))`;
  const keys = [sender, "project"].map((scope) => createHmac("sha256", secret).update(`${bucket}:${scope}`).digest("hex"));
  const minute = new Date(now.getTime() - 60_000);
  const counts = await tx.rateLimitEvent.groupBy({ by: ["key"], where: { bucket, key: { in: keys }, createdAt: { gte: minute } }, _count: { _all: true } });
  if (keys.some((key, index) => (counts.find((row) => row.key === key)?._count._all ?? 0) >= ingressLimits[kind][index])) return false;
  await tx.rateLimitEvent.createMany({ data: keys.map((key) => ({ key, bucket, createdAt: now })) });
  return true;
}

export async function claimTelegramUpdate(updateId: number, now = new Date(), ingress?: Ingress): Promise<TelegramLease | null> {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error("INVALID_TELEGRAM_UPDATE_ID");
  const id = BigInt(updateId);
  return getDatabase().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-update:${id}`}, 0))::text`;
    const row = await tx.telegramUpdate.findUnique({ where: { telegramUpdateId: id } });
    if (!row) {
      if (ingress && !await reserveIngress(tx, ingress, now)) return null;
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
  // Seven days covers the replay window for completed and abandoned updates.
  await database.$executeRaw`DELETE FROM "TelegramUpdate" WHERE "telegramUpdateId" IN (
    SELECT "telegramUpdateId" FROM "TelegramUpdate" WHERE "updatedAt" < now() - interval '7 days'
    AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '7 days') LIMIT 100
  )`;
  await database.$executeRaw`DELETE FROM "TelegramLinkToken" WHERE "id" IN (
    SELECT "id" FROM "TelegramLinkToken" WHERE "expiresAt" < now() - interval '1 day' LIMIT 100
  )`;
  await database.$executeRaw`DELETE FROM "PendingTelegramAction" WHERE "id" IN (
    SELECT "id" FROM "PendingTelegramAction" WHERE "expiresAt" < now() - interval '7 days' LIMIT 100
  )`;
  await database.$executeRaw`UPDATE "PendingTelegramAction" SET "payload" = 'null'::jsonb
    WHERE "id" IN (SELECT "id" FROM "PendingTelegramAction"
      WHERE "payload" <> 'null'::jsonb AND ("consumedAt" IS NOT NULL OR "expiresAt" <= now()) LIMIT 100)`;
  await database.$executeRaw`UPDATE "TelegramConnection" SET "financeTopic" = NULL, "financeTopicExpiresAt" = NULL
    WHERE "financeTopicExpiresAt" <= now() AND "id" IN (
      SELECT "id" FROM "TelegramConnection" WHERE "financeTopicExpiresAt" <= now() LIMIT 100
    )`;
  await database.$executeRaw`DELETE FROM "RateLimitEvent" WHERE "id" IN (
    SELECT "id" FROM "RateLimitEvent" WHERE "bucket" LIKE 'telegram:%' AND "createdAt" < now() - interval '1 minute' LIMIT 300
  )`;
}
