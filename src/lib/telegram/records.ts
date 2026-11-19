import "server-only";
import { Prisma, type Transaction } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { getBillRestoration, lockLedgerRecord, restoreBillPayment } from "@/lib/finance/bill-payments";
import { monthRange, parseDate } from "@/lib/finance/dates";
import { Decimal } from "@/lib/finance/money";
import { authorizeTelegram, TelegramAccessError } from "./access";
import { notificationSettingsSchema, recordContextSchema, type FinanceMutation, type NotificationSettings, type RecordContext } from "./schemas";

type Tx = Prisma.TransactionClient;
type LedgerChange = Extract<FinanceMutation, { operation: "change_transaction" }>;

export const notificationFields = {
  billReminderDays: true, budgetReminderPercent: true, weeklyDigestDay: true,
} as const;

export async function readRecordContext(userId: string, sender: string, connectionId: string, updateId: number, now: Date) {
  return getDatabase().$transaction(async (tx) => {
    const connection = await authorizeTelegram(tx, userId, sender);
    if (connection.id !== connectionId) throw new TelegramAccessError();
    const row = await tx.telegramConnection.findFirst({
      where: { id: connectionId, userId, recordContextExpiresAt: { gt: now }, recordContextUpdateId: { lt: BigInt(updateId) } },
      select: { recordContext: true },
    });
    const parsed = recordContextSchema.safeParse(row?.recordContext);
    return parsed.success ? parsed.data : null;
  });
}

export async function rememberRecords(userId: string, sender: string, connectionId: string, updateId: number, context: RecordContext | null) {
  const records = context && recordContextSchema.parse(context);
  const expiresAt = new Date(Date.now() + 600_000);
  const replayWindowAgo = new Date(expiresAt.getTime() - 7 * 86_400_000);
  await getDatabase().$transaction(async (tx) => {
    const connection = await authorizeTelegram(tx, userId, sender);
    if (connection.id !== connectionId) throw new TelegramAccessError();
    await tx.telegramConnection.updateMany({
      // Telegram can reset its update sequence after a week without updates.
      where: { id: connectionId, userId, OR: [
        { recordContextUpdateId: null }, { recordContextUpdateId: { lt: BigInt(updateId) } }, { recordContextExpiresAt: { lte: replayWindowAgo } },
      ] },
      data: { recordContext: records ?? Prisma.DbNull, recordContextExpiresAt: expiresAt, recordContextUpdateId: BigInt(updateId) },
    });
  });
}

export function serializeLedgerRecord(record: Transaction & { category: { name: string } }) {
  return {
    id: record.id, amount: record.amount.toFixed(2), description: record.description, type: record.type,
    occurredOn: record.occurredOn.toISOString().slice(0, 10), updatedAt: record.updatedAt.toISOString(),
    categoryId: record.categoryId, categoryName: record.category.name,
  };
}

type LedgerSearch = { ids: string[] } | { last: true } | { name: string; occurredOn?: string };
export async function findLedgerRecords(userId: string, sender: string, search: LedgerSearch) {
  const where: Prisma.TransactionWhereInput = "ids" in search ? { id: { in: search.ids } }
    : "name" in search ? {
      description: { contains: search.name.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" },
      ...(search.occurredOn ? { occurredOn: parseDate(search.occurredOn) } : {}),
    } : {};
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const rows = await tx.transaction.findMany({
      where: { userId, ...where }, include: { category: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: "last" in search ? 1 : 11,
    });
    if ("ids" in search) {
      const ordered = new Map(rows.map((row) => [row.id, row]));
      return search.ids.flatMap((id) => { const row = ordered.get(id); return row ? [serializeLedgerRecord(row)] : []; });
    }
    return rows.map(serializeLedgerRecord);
  });
}

export async function proposeLedgerChange(userId: string, sender: string, id: string, change: LedgerChange["change"]) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const row = await tx.transaction.findFirst({ where: { id, userId }, include: { category: { select: { name: true } } } });
    if (!row) return { error: "Transaksi itu sudah tiada. Pilih rekod lain." };
    if (change.mode === "edit") return { operation: "change_transaction" as const, change, record: serializeLedgerRecord(row) };
    const restoration = await getBillRestoration(tx, userId, row);
    if (restoration.kind === "LEGACY") return { error: "Rekod lama ini tiada maklumat pautan bil yang diperlukan untuk undo dengan selamat." };
    if (restoration.kind === "BILL_CHANGED") return { error: "Jadual bil sudah berubah selepas bayaran ini. Bayaran dan jadual perlu disemak bersama di DuitFlow." };
    const restore = restoration.kind === "RESTORE"
      ? { name: restoration.name, dueOn: restoration.due.toISOString().slice(0, 10), version: restoration.version } : undefined;
    return { operation: "change_transaction" as const, change, record: serializeLedgerRecord(row), restore };
  });
}

function budgetKey(userId: string, categoryId: string, period: string) {
  const { start } = monthRange(period);
  return { userId, categoryId, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
}

export async function proposeBudget(userId: string, sender: string, categoryId: string, period: string, amount: string) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const category = await tx.category.findFirst({ where: { id: categoryId, userId, transactionType: "EXPENSE" }, select: { name: true } });
    if (!category) throw new TelegramAccessError();
    const row = await tx.budget.findFirst({ where: budgetKey(userId, categoryId, period) });
    return {
      operation: "set_budget" as const, categoryId, categoryName: category.name, period, amount,
      previous: row ? { id: row.id, amount: row.limitAmount.toFixed(2), updatedAt: row.updatedAt.toISOString() } : null,
    };
  });
}

export async function getNotificationSettings(userId: string, sender: string) {
  return getDatabase().$transaction(async (tx) => {
    const { id } = await authorizeTelegram(tx, userId, sender);
    const row = await tx.telegramConnection.findFirstOrThrow({
      where: { id, userId }, select: { ...notificationFields, notificationVersion: true },
    });
    return { version: row.notificationVersion, settings: notificationSettingsSchema.parse({
      billReminderDays: row.billReminderDays, budgetReminderPercent: row.budgetReminderPercent, weeklyDigestDay: row.weeklyDigestDay,
    } satisfies NotificationSettings) };
  });
}

// The approval DAL has already locked and authorized this specific connection
// and consumed the pending action in this transaction.
export async function applyFinanceMutation(tx: Tx, userId: string, connectionId: string, payload: FinanceMutation) {
  const stale = { kind: "RECORD_CHANGED" as const };
  if (payload.operation === "set_notifications") {
    const saved = await tx.telegramConnection.updateMany({
      where: { id: connectionId, userId, notificationVersion: payload.version, ...payload.previous },
      data: { ...payload.next, notificationVersion: { increment: 1 } },
    });
    return saved.count ? { kind: "NOTIFICATIONS_SAVED" as const, settings: payload.next } : stale;
  }
  if (payload.operation === "set_budget") {
    const key = budgetKey(userId, payload.categoryId, payload.period);
    const category = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Category" WHERE "id" = ${payload.categoryId}
        AND "userId" = ${userId} AND "transactionType" = 'EXPENSE' AND "name" = ${payload.categoryName} FOR SHARE`;
    if (!category.length) return stale;
    const limitAmount = new Decimal(payload.amount);
    const saved = payload.previous
      ? await tx.budget.updateMany({
        where: { ...key, id: payload.previous.id, updatedAt: new Date(payload.previous.updatedAt), limitAmount: new Decimal(payload.previous.amount) },
        data: { limitAmount },
      })
      : await tx.budget.createMany({ data: { ...key, limitAmount }, skipDuplicates: true });
    return saved.count ? { kind: "BUDGET_SAVED" as const, label: payload.categoryName, period: payload.period, amount: payload.amount } : stale;
  }
  const { record, change } = payload;
  const current = await lockLedgerRecord(tx, userId, record.id);
  if (!current || current.updatedAt.toISOString() !== record.updatedAt || !current.amount.eq(record.amount)
    || current.description !== record.description || current.occurredOn.toISOString().slice(0, 10) !== record.occurredOn
    || current.type !== record.type || current.categoryId !== record.categoryId) return stale;
  const where = { userId, id: record.id };
  if (change.mode === "edit" && change.amount) {
    await tx.transaction.update({ where, data: { amount: new Decimal(change.amount) } });
    return { kind: "TRANSACTION_EDITED" as const, id: record.id, description: record.description, amount: change.amount };
  }
  if (change.mode !== "undo" || current.billPaidVersion !== (payload.restore?.version ?? null)
    || !await restoreBillPayment(tx, userId, current)) return stale;
  await tx.transaction.delete({ where });
  return { kind: "TRANSACTION_UNDONE" as const, description: record.description, restore: payload.restore };
}
