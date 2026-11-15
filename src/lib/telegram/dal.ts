import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser, AccessError } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import { monthRange, parseDate } from "@/lib/finance/dates";
import { Decimal } from "@/lib/finance/money";
import { idSchema, monthSchema } from "@/lib/finance/validation";
import { clarificationSchema, proposalSchema } from "./schemas";

const telegramId = z.string().regex(/^[1-9]\d{0,19}$/);
const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const actionId = z.uuid();
const ttl = 10 * 60 * 1000;
type Tx = Prisma.TransactionClient;

export class TelegramAccessError extends Error {
  constructor() { super("TELEGRAM_NOT_LINKED"); }
}

async function lockUser(tx: Tx, userId: string) {
  idSchema.parse(userId);
  // Share a row lock with unlink, redemption and approval. An unlink cannot
  // commit between authorization and a Telegram mutation or scoped read.
  const users = await tx.$queryRaw<Array<{ isDemo: boolean }>>`
    SELECT "isDemo" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  return users[0];
}

async function authorizeTelegram(tx: Tx, userId: string, sender: string) {
  telegramId.parse(sender);
  const user = await lockUser(tx, userId);
  const connection = await tx.telegramConnection.findFirst({ where: { userId, telegramUserId: sender }, select: { id: true } });
  if (!user || user.isDemo || !connection) throw new TelegramAccessError();
}

async function authorizeBrowser(userId: string) {
  await requireUser(userId);
  idSchema.parse(userId);
}

export async function getTelegramSettings(userId: string) {
  await authorizeBrowser(userId);
  const row = await getDatabase().telegramConnection.findUnique({ where: { userId }, select: { telegramUserId: true, linkedAt: true } });
  return { telegramUserId: row?.telegramUserId ?? null, linkedAt: row?.linkedAt.toISOString() ?? null };
}

export async function createLinkToken(userId: string) {
  await authorizeBrowser(userId);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttl);
  await getDatabase().$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (!user || user.isDemo) throw new AccessError("FORBIDDEN");
    if (await tx.telegramConnection.findUnique({ where: { userId }, select: { id: true } })) throw new AccessError("FORBIDDEN");
    await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.telegramLinkToken.create({ data: { userId, hashedToken: hashToken(token), expiresAt } });
  });
  // The raw bearer token is returned once, never stored, logged or put in a URL
  // in this app. Only the user's explicit Telegram deep link contains it.
  return { token, expiresAt: expiresAt.toISOString() };
}

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function redeemLinkToken(token: string, sender: string): Promise<"LINKED" | "INVALID" | "CONFLICT"> {
  if (!linkToken.safeParse(token).success || !telegramId.safeParse(sender).success) return "INVALID";
  try {
    return await getDatabase().$transaction(async (tx) => {
      // Serialize competing accounts redeeming tokens for the same identity.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram:${sender}`}))`;
      const row = await tx.telegramLinkToken.findUnique({ where: { hashedToken: hashToken(token) } });
      if (!row) return "INVALID";
      const user = await lockUser(tx, row.userId);
      const now = new Date();
      if (!user || user.isDemo || row.consumedAt || row.expiresAt <= now) return "INVALID";
      const existing = await tx.telegramConnection.findFirst({ where: { OR: [{ userId: row.userId }, { telegramUserId: sender }] }, select: { id: true } });
      if (existing) return "CONFLICT";
      const claimed = await tx.telegramLinkToken.updateMany({ where: { id: row.id, userId: row.userId, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) return "INVALID";
      await tx.telegramConnection.create({ data: { userId: row.userId, telegramUserId: sender } });
      await tx.telegramLinkToken.updateMany({ where: { userId: row.userId, consumedAt: null }, data: { consumedAt: now } });
      return "LINKED";
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "CONFLICT";
    throw error;
  }
}

export async function unlinkTelegram(userId: string) {
  await authorizeBrowser(userId);
  await getDatabase().$transaction(async (tx) => {
    if (!await lockUser(tx, userId)) throw new AccessError("UNAUTHENTICATED");
    await tx.pendingTelegramAction.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.telegramConnection.deleteMany({ where: { userId } });
  });
}

// The only identity lookup before a userId exists. The sender comes from the
// secret-authenticated private Telegram update, never from a browser form.
export async function resolveTelegramUser(sender: string) {
  telegramId.parse(sender);
  const connection = await getDatabase().telegramConnection.findUnique({ where: { telegramUserId: sender }, select: { userId: true, user: { select: { isDemo: true } } } });
  return connection && !connection.user.isDemo ? { id: connection.userId } : null;
}

export async function getTelegramCategories(userId: string, sender: string) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.category.findMany({ where: { userId }, select: { id: true, name: true, transactionType: true }, orderBy: { name: "asc" } });
  });
}

export async function getPendingAction(userId: string, sender: string) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.pendingTelegramAction.findFirst({ where: { userId, telegramUserId: sender, consumedAt: null, expiresAt: { gt: new Date() } } });
  });
}

function pendingIdForUpdate(sender: string, updateId: number) {
  telegramId.parse(sender);
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(updateId);
  // A stable UUID is an idempotency key, never an authorization credential.
  const bytes = createHash("sha256").update(`duitflow:telegram-action:${sender}:${updateId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getActionForUpdate(userId: string, sender: string, updateId: number) {
  const id = pendingIdForUpdate(sender, updateId);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.pendingTelegramAction.findFirst({ where: { id, userId, telegramUserId: sender } });
  });
}

export async function replacePendingAction(userId: string, sender: string, kind: "PROPOSAL" | "CLARIFICATION", input: unknown, updateId?: number) {
  const payload = kind === "PROPOSAL" ? proposalSchema.parse(input) : clarificationSchema.parse(input);
  const id = updateId === undefined ? undefined : pendingIdForUpdate(sender, updateId);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    if (id) {
      const existing = await tx.pendingTelegramAction.findFirst({ where: { id, userId, telegramUserId: sender } });
      if (existing) return existing;
    }
    const now = new Date();
    await tx.pendingTelegramAction.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now } });
    return tx.pendingTelegramAction.create({ data: { ...(id ? { id } : {}), userId, telegramUserId: sender, kind, payload, expiresAt: new Date(now.getTime() + ttl) } });
  });
}

export async function cancelPendingAction(userId: string, sender: string, id?: string) {
  if (id !== undefined) actionId.parse(id);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.pendingTelegramAction.updateMany({ where: { userId, telegramUserId: sender, consumedAt: null, ...(id ? { id, expiresAt: { gt: new Date() } } : {}) }, data: { consumedAt: new Date() } });
  });
}

export async function approvePendingAction(userId: string, sender: string, id: string) {
  actionId.parse(id);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const now = new Date();
    const where = { id, userId, telegramUserId: sender, kind: "PROPOSAL" as const, consumedAt: null, expiresAt: { gt: now } };
    const claimed = await tx.pendingTelegramAction.updateMany({ where, data: { consumedAt: now } });
    if (claimed.count !== 1) return null;
    const row = await tx.pendingTelegramAction.findFirstOrThrow({ where: { id, userId, telegramUserId: sender } });
    const payload = proposalSchema.parse(row.payload);
    const saved = [];
    for (const proposed of payload.transactions) {
      if (!await tx.category.findFirst({ where: { id: proposed.categoryId, userId, transactionType: proposed.type }, select: { id: true } })) throw new TelegramAccessError();
      const record = await tx.transaction.create({ data: { ...proposed, amount: new Decimal(proposed.amount), occurredOn: parseDate(proposed.occurredOn), userId, source: "TELEGRAM" }, include: { category: { select: { name: true } } } });
      saved.push({ id: record.id, categoryName: record.category.name, amount: record.amount.toFixed(2), type: record.type, description: record.description, occurredOn: record.occurredOn.toISOString().slice(0, 10) });
    }
    return saved;
  });
}

export async function getTelegramReport(userId: string, sender: string, month: string) {
  const { start, end } = monthRange(monthSchema.parse(month));
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const where = { userId, occurredOn: { gte: start, lt: end } };
    const totals = await tx.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } });
    const income = totals.find((row) => row.type === "INCOME")?._sum.amount ?? new Decimal(0);
    const expense = totals.find((row) => row.type === "EXPENSE")?._sum.amount ?? new Decimal(0);
    const grouped = await tx.transaction.groupBy({ by: ["categoryId"], where: { ...where, type: "EXPENSE" }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 10 });
    const categories = await tx.category.findMany({ where: { userId, id: { in: grouped.map((row) => row.categoryId) } }, select: { id: true, name: true } });
    const recent = await tx.transaction.findMany({ where, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], take: 5, select: { amount: true, type: true, description: true, occurredOn: true } });
    return { income: income.toFixed(2), expense: expense.toFixed(2), net: income.minus(expense).toFixed(2),
      breakdown: grouped.map((row) => ({ categoryName: categories.find((category) => category.id === row.categoryId)!.name, amount: row._sum.amount!.toFixed(2) })),
      recent: recent.map((row) => ({ ...row, amount: row.amount.toFixed(2), occurredOn: row.occurredOn.toISOString().slice(0, 10) })) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getTelegramBudgets(userId: string, sender: string, month: string) {
  const { start, end } = monthRange(monthSchema.parse(month));
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const budgets = await tx.budget.findMany({ where: { userId, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 }, include: { category: { select: { name: true } } }, orderBy: { category: { name: "asc" } }, take: 20 });
    const totals = await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", occurredOn: { gte: start, lt: end }, categoryId: { in: budgets.map((row) => row.categoryId) } }, _sum: { amount: true } });
    return budgets.map((row) => {
      const spent = totals.find((total) => total.categoryId === row.categoryId)?._sum.amount ?? new Decimal(0);
      return { categoryName: row.category.name, limitAmount: row.limitAmount.toFixed(2), spent: spent.toFixed(2), remaining: row.limitAmount.minus(spent).toFixed(2) };
    });
  }, { isolationLevel: "RepeatableRead" });
}
