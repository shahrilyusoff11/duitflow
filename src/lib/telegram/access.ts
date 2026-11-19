import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { idSchema } from "@/lib/finance/validation";

export const telegramId = z.string().regex(/^[1-9]\d{0,19}$/);
export class TelegramAccessError extends Error {
  constructor() { super("TELEGRAM_NOT_LINKED"); }
}

export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  idSchema.parse(userId);
  const users = await tx.$queryRaw<Array<{ isDemo: boolean }>>`
    SELECT "isDemo" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  return users[0];
}

export async function authorizeTelegram(tx: Prisma.TransactionClient, userId: string, sender: string) {
  telegramId.parse(sender);
  const user = await lockUser(tx, userId);
  if (!user || user.isDemo) throw new TelegramAccessError();
  // Unlink shares the user lock. Lock the connection too so a repeatable-read
  // snapshot cannot authorize against a concurrently deleted connection.
  const [connection] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TelegramConnection"
    WHERE "userId" = ${userId} AND "telegramUserId" = ${sender} FOR UPDATE`;
  if (!connection) throw new TelegramAccessError();
  return connection;
}
