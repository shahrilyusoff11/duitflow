import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma, type PendingTelegramAction } from "@/generated/prisma/client";
import { requireUser, AccessError } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import { getTelegramConfig } from "@/lib/config/telegram";
import { monthRange, parseDate, shiftMonth, todayInMalaysia } from "@/lib/finance/dates";
import { Decimal } from "@/lib/finance/money";
import { idSchema, monthSchema, transactionSchema } from "@/lib/finance/validation";
import { pendingClarificationSchema, pendingProposalSchema } from "./schemas";
import { financeQuerySchema, financeTopicSchema } from "@/lib/ai/schemas";
import { matchCategory } from "@/lib/ai/interpret";
import { billAfterPayment, billScheduleLabel } from "@/lib/finance/bill-schedule";
import { saveBillPayment } from "@/lib/finance/bill-payments";
import { authorizeTelegram, lockUser, telegramId, TelegramAccessError } from "./access";
import { applyFinanceMutation } from "./records";

export { TelegramAccessError } from "./access";
const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const actionId = z.uuid();
const ttl = 10 * 60 * 1000;
type Tx = Prisma.TransactionClient;

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
    await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date(), pendingTelegramUserId: null } });
    await tx.telegramLinkToken.create({ data: { userId, hashedToken: hashToken(token), expiresAt } });
  });
  // The raw bearer token is returned once, never stored, logged or put in a URL
  // in this app. Only the user's explicit Telegram deep link contains it.
  return { token, expiresAt: expiresAt.toISOString() };
}

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

function linkCode(hash: string, sender: string) {
  const { webhookSecret } = getTelegramConfig(process.env);
  return createHmac("sha256", webhookSecret).update(`telegram-link-confirmation:${hash}:${sender}`).digest().subarray(0, 12).toString("base64url");
}

export async function redeemLinkToken(token: string, sender: string): Promise<{ code: string } | "INVALID" | "CONFLICT"> {
  if (!linkToken.safeParse(token).success || !telegramId.safeParse(sender).success) return "INVALID";
  const hashedToken = hashToken(token);
  return getDatabase().$transaction(async (tx) => {
    const owner = await tx.telegramLinkToken.findUnique({ where: { hashedToken }, select: { userId: true } });
    if (!owner) return "INVALID";
    const user = await lockUser(tx, owner.userId);
    const row = await tx.telegramLinkToken.findUnique({ where: { hashedToken } });
    const now = new Date();
    if (!user || user.isDemo || !row || row.consumedAt || row.expiresAt <= now) return "INVALID";
    const existing = await tx.telegramConnection.findFirst({ where: { OR: [{ userId: row.userId }, { telegramUserId: sender }] }, select: { id: true } });
    if (existing || (row.pendingTelegramUserId && row.pendingTelegramUserId !== sender)) return "CONFLICT";
    if (!row.pendingTelegramUserId) await tx.telegramLinkToken.update({ where: { id: row.id }, data: { pendingTelegramUserId: sender } });
    return { code: linkCode(hashedToken, sender) };
  });
}

export async function confirmTelegramLink(userId: string, input: unknown): Promise<boolean> {
  await authorizeBrowser(userId);
  const code = z.string().trim().regex(/^[A-Za-z0-9_-]{16}$/).parse(input);
  try {
    return await getDatabase().$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      const now = new Date();
      if (!user || user.isDemo) return false;
      const row = await tx.telegramLinkToken.findFirst({ where: { userId, consumedAt: null, expiresAt: { gt: now }, pendingTelegramUserId: { not: null } } });
      const sender = row?.pendingTelegramUserId;
      if (!row || !sender || !timingSafeEqual(Buffer.from(code), Buffer.from(linkCode(row.hashedToken, sender)))) return false;
      await tx.telegramConnection.create({ data: { userId, telegramUserId: sender } });
      await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now, pendingTelegramUserId: null } });
      return true;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function unlinkTelegram(userId: string) {
  await authorizeBrowser(userId);
  await getDatabase().$transaction(async (tx) => {
    if (!await lockUser(tx, userId)) throw new AccessError("UNAUTHENTICATED");
    await tx.pendingTelegramAction.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date(), payload: Prisma.JsonNull } });
    await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date(), pendingTelegramUserId: null } });
    await tx.telegramConnection.deleteMany({ where: { userId } });
  });
}

// The only identity lookup before a userId exists. The sender comes from the
// secret-authenticated private Telegram update, never from a browser form.
export async function resolveTelegramUser(sender: string) {
  telegramId.parse(sender);
  const connection = await getDatabase().telegramConnection.findUnique({ where: { telegramUserId: sender }, select: { id: true, userId: true, user: { select: { isDemo: true } } } });
  return connection && !connection.user.isDemo ? { id: connection.userId, connectionId: connection.id } : null;
}

export async function getTelegramCategories(userId: string, sender: string) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.category.findMany({ where: { userId }, select: { id: true, name: true, transactionType: true }, orderBy: { name: "asc" } });
  });
}

export async function consumeTelegramAiAttempt(userId: string, sender: string, minuteLimit: number, dailyLimit: number) {
  z.number().int().min(1).max(2).parse(minuteLimit);
  z.number().int().min(1).max(30).parse(dailyLimit);
  return getDatabase().$transaction(async (tx) => {
    // One project lock protects both shared and per-user windows across workers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('duitflow:ai:quota'))`;
    await authorizeTelegram(tx, userId, sender);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { deepseekParsingEnabled: true } });
    if (!user.deepseekParsingEnabled) return false;
    const key = createHash("sha256").update(`ai-user:${userId}`).digest("hex");
    const projectKey = createHash("sha256").update("ai-project:deepseek").digest("hex");
    const now = new Date();
    const day = new Date(now.getTime() - 86_400_000), minute = new Date(now.getTime() - 60_000);
    for (const [identity, perMinute, perDay] of [[key, minuteLimit, dailyLimit], [projectKey, 4, 30]] as const) {
      if (await tx.rateLimitEvent.count({ where: { key: identity, bucket: "ai:parse", createdAt: { gte: minute } } }) >= perMinute) return false;
      if (await tx.rateLimitEvent.count({ where: { key: identity, bucket: "ai:parse", createdAt: { gte: day } } }) >= perDay) return false;
    }
    await tx.rateLimitEvent.createMany({ data: [{ key, bucket: "ai:parse", createdAt: now }, { key: projectKey, bucket: "ai:parse", createdAt: now }] });
    await tx.$executeRaw`DELETE FROM "RateLimitEvent" WHERE "id" IN (
      SELECT "id" FROM "RateLimitEvent" WHERE "createdAt" < now() - interval '1 day' LIMIT 100
    )`;
    return true;
  });
}

export async function getTelegramFinanceTopic(userId: string, sender: string, connectionId: string, updateId: number, now = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const connection = await authorizeTelegram(tx, userId, sender);
    if (connection.id !== connectionId) throw new TelegramAccessError();
    const row = await tx.telegramConnection.findFirst({
      where: { id: connectionId, userId, financeTopicExpiresAt: { gt: now } },
      select: { financeTopic: true },
    });
    const topic = financeTopicSchema.safeParse(row?.financeTopic);
    return topic.success && topic.data.updateId < updateId ? topic.data.query : null;
  });
}

export async function setTelegramFinanceTopic(userId: string, sender: string, connectionId: string, updateId: number, query: unknown, now = new Date()) {
  const topic = financeTopicSchema.parse({ updateId, query });
  await getDatabase().$transaction(async (tx) => {
    const connection = await authorizeTelegram(tx, userId, sender);
    if (connection.id !== connectionId) throw new TelegramAccessError();
    const existing = await tx.telegramConnection.findFirst({
      where: { id: connectionId, userId, financeTopicExpiresAt: { gt: now } },
      select: { financeTopic: true },
    });
    const previous = financeTopicSchema.safeParse(existing?.financeTopic);
    if (previous.success && previous.data.updateId >= updateId) return;
    await tx.telegramConnection.update({
      where: { id: connectionId, userId },
      data: { financeTopic: topic, financeTopicExpiresAt: new Date(now.getTime() + ttl) },
    });
  });
}

function recordedRange(month: string, today: string) {
  const range = monthRange(month);
  if (month !== today.slice(0, 7)) return range;
  const end = parseDate(today);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: range.start, end };
}

async function readMonthlyAnalysis(tx: Tx, userId: string, month: string, today: string) {
  const { start, end } = recordedRange(month, today);
  const where = { userId, occurredOn: { gte: start, lt: end } };
  const totals = await tx.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } });
  const income = totals.find((row) => row.type === "INCOME")?._sum.amount ?? new Decimal(0);
  const expense = totals.find((row) => row.type === "EXPENSE")?._sum.amount ?? new Decimal(0);
  const top = await tx.transaction.groupBy({
    by: ["categoryId"], where: { ...where, type: "EXPENSE" }, _sum: { amount: true },
    orderBy: [{ _sum: { amount: "desc" } }, { categoryId: "asc" }], take: 1,
  });
  const category = top[0] && await tx.category.findFirst({
    where: { id: top[0].categoryId, userId, transactionType: "EXPENSE" }, select: { name: true },
  });
  const warnings = await tx.$queryRaw<Array<{ categoryName: string; limit: Decimal; spent: Decimal }>>`
    SELECT c."name" AS "categoryName", b."limitAmount" AS "limit", SUM(t."amount") AS "spent"
    FROM "Budget" b
    JOIN "Category" c ON c."id" = b."categoryId" AND c."userId" = b."userId"
    JOIN "Transaction" t ON t."userId" = b."userId" AND t."categoryId" = b."categoryId"
      AND t."type" = 'EXPENSE' AND t."occurredOn" >= ${start.toISOString().slice(0, 10)}::date
      AND t."occurredOn" < ${end.toISOString().slice(0, 10)}::date
    WHERE b."userId" = ${userId} AND b."year" = ${start.getUTCFullYear()} AND b."month" = ${start.getUTCMonth() + 1}
    GROUP BY b."id", c."name"
    HAVING SUM(t."amount") * 100 >= b."limitAmount" * b."warningAt"
    ORDER BY SUM(t."amount") / b."limitAmount" DESC, c."name" ASC, b."id" ASC
    LIMIT 3`;
  const monthToDate = month === today.slice(0, 7);
  const previousMonth = shiftMonth(month, -1);
  let previousExpense: Decimal | null = null;
  if (previousMonth >= "2000-01") {
    const previous = monthRange(previousMonth);
    const matchingEnd = new Date(previous.start);
    matchingEnd.setUTCDate(matchingEnd.getUTCDate() + Number(today.slice(-2)));
    const previousEnd = monthToDate && matchingEnd < previous.end ? matchingEnd : previous.end;
    const result = await tx.transaction.aggregate({
      where: { userId, type: "EXPENSE", occurredOn: { gte: previous.start, lt: previousEnd } },
      _sum: { amount: true },
    });
    previousExpense = result._sum.amount;
  }
  return {
    monthToDate, hasRecords: totals.length > 0,
    income: income.toFixed(2), expense: expense.toFixed(2), net: income.minus(expense).toFixed(2),
    top: category ? { name: category.name, amount: top[0]._sum.amount!.toFixed(2) } : null,
    warnings: warnings.map((row) => ({
      categoryName: row.categoryName, limit: row.limit.toFixed(2), spent: row.spent.toFixed(2),
      remaining: row.limit.minus(row.spent).toFixed(2),
    })),
    previousMonth,
    previousExpense: previousExpense?.toFixed(2) ?? null,
    change: previousExpense === null ? null : expense.minus(previousExpense).toFixed(2),
  };
}

async function readSpendingTrend(tx: Tx, userId: string, endingMonth: string, count: number, today: string) {
  const periods = Array.from({ length: count }, (_, index) => shiftMonth(endingMonth, index - count + 1))
    .filter((period) => period >= "2000-01");
  const start = monthRange(periods[0]).start;
  const { end } = recordedRange(endingMonth, today);
  const rows = await tx.$queryRaw<Array<{ month: string; amount: Decimal }>>`
    SELECT to_char("occurredOn", 'YYYY-MM') AS "month", SUM("amount") AS "amount"
    FROM "Transaction"
    WHERE "userId" = ${userId} AND "type" = 'EXPENSE'
      AND "occurredOn" >= ${start.toISOString().slice(0, 10)}::date AND "occurredOn" < ${end.toISOString().slice(0, 10)}::date
    GROUP BY 1`;
  const byMonth = new Map(rows.map((row) => [row.month, row.amount.toFixed(2)]));
  return periods.map((month) => ({ month, amount: byMonth.get(month) ?? "0.00", partial: month === today.slice(0, 7) }));
}

// A fixed dispatch table over scoped queries. The model supplies no SQL,
// identity, totals or response prose. Render only values read from PostgreSQL.
export async function queryTelegramFinance(userId: string, sender: string, input: unknown, now = new Date()) {
  const query = financeQuerySchema.parse(input);
  const today = todayInMalaysia(now);
  const currentMonth = today.slice(0, 7);
  const month = "period" in query ? monthSchema.parse(query.period === "this_month" ? currentMonth : query.period === "last_month" ? shiftMonth(currentMonth, -1) : query.period) : null;
  if (query.operation === "report_for_period") {
    return { kind: "REPORT" as const, month: month!, view: query.view, report: await getTelegramReport(userId, sender, month!) };
  }
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const range = month ? monthRange(month) : null;
    const where = { userId, ...(range ? { occurredOn: { gte: range.start, lt: range.end } } : {}) };
    if (month && month > currentMonth && (query.operation === "analyze_for_period" || query.operation === "spending_trend" || query.operation === "purchase_check")) {
      return { kind: "FUTURE_PERIOD" as const };
    }
    let categoryId: string | undefined;
    let categoryName: string | undefined;
    if ("categoryName" in query && query.categoryName) {
      const categories = await tx.category.findMany({ where: { userId, transactionType: "EXPENSE" }, select: { id: true, name: true, transactionType: true } });
      const category = matchCategory(query.categoryName, categories, "EXPENSE");
      if (!category) return { kind: "UNKNOWN_CATEGORY" as const };
      categoryId = category.id;
      categoryName = category.name;
    }
    switch (query.operation) {
      case "analyze_for_period":
        return { kind: "ANALYSIS" as const, month: month!, focus: query.focus, ...await readMonthlyAnalysis(tx, userId, month!, today) };
      case "spending_trend":
        return { kind: "TREND" as const, month: month!, rows: await readSpendingTrend(tx, userId, month!, query.months, today) };
      case "purchase_check": {
        if (!categoryId || !categoryName || !query.amount) return { kind: "PURCHASE_DETAILS" as const };
        const budget = await tx.budget.findFirst({
          where: { userId, categoryId, year: range!.start.getUTCFullYear(), month: range!.start.getUTCMonth() + 1 },
          select: { limitAmount: true },
        });
        const result = { kind: "PURCHASE" as const, month: month!, categoryName, amount: query.amount };
        if (!budget) return { ...result, budget: null };
        const totals = await tx.transaction.aggregate({ where: { ...where, categoryId, type: "EXPENSE" }, _sum: { amount: true } });
        const spent = totals._sum.amount ?? new Decimal(0);
        const remaining = budget.limitAmount.minus(spent);
        return { ...result, budget: { limit: budget.limitAmount.toFixed(2), spent: spent.toFixed(2),
          remaining: remaining.toFixed(2), after: remaining.minus(query.amount).toFixed(2) } };
      }
      case "net_for_period": {
        const totals = await tx.transaction.groupBy({ by: ["type"], where, _sum: { amount: true } });
        const income = totals.find((row) => row.type === "INCOME")?._sum.amount ?? new Decimal(0);
        const expense = totals.find((row) => row.type === "EXPENSE")?._sum.amount ?? new Decimal(0);
        return { kind: "NET" as const, month: month!, income: income.toFixed(2), expense: expense.toFixed(2), net: income.minus(expense).toFixed(2) };
      }
      case "spend_by_category": {
        const total = await tx.transaction.aggregate({ where: { ...where, categoryId, type: "EXPENSE" }, _sum: { amount: true } });
        return { kind: "SPEND" as const, month: month!, categoryName: categoryName!, amount: (total._sum.amount ?? new Decimal(0)).toFixed(2) };
      }
      case "total_for_period": {
        const total = await tx.transaction.aggregate({ where: { ...where, type: query.type }, _sum: { amount: true } });
        return { kind: "TOTAL" as const, month: month!, type: query.type, amount: (total._sum.amount ?? new Decimal(0)).toFixed(2) };
      }
      case "top_categories": {
        const totals = await tx.transaction.groupBy({ by: ["categoryId"], where: { ...where, type: "EXPENSE" }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: query.limit });
        const categories = await tx.category.findMany({ where: { userId, id: { in: totals.map((row) => row.categoryId) } }, select: { id: true, name: true } });
        return { kind: "TOP" as const, month: month!, rows: totals.map((row) => ({ categoryName: categories.find((item) => item.id === row.categoryId)!.name, amount: row._sum.amount!.toFixed(2) })) };
      }
      case "budget_status": {
        const budgets = await tx.budget.findMany({ where: { userId, year: range!.start.getUTCFullYear(), month: range!.start.getUTCMonth() + 1, ...(categoryId ? { categoryId } : {}) }, include: { category: { select: { name: true } } }, take: 20, orderBy: { category: { name: "asc" } } });
        const totals = await tx.transaction.groupBy({ by: ["categoryId"], where: { ...where, type: "EXPENSE", categoryId: { in: budgets.map((row) => row.categoryId) } }, _sum: { amount: true } });
        return { kind: "BUDGET" as const, month: month!, rows: budgets.map((row) => {
          const spent = totals.find((item) => item.categoryId === row.categoryId)?._sum.amount ?? new Decimal(0);
          return { categoryName: row.category.name, limit: row.limitAmount.toFixed(2), spent: spent.toFixed(2), remaining: row.limitAmount.minus(spent).toFixed(2), percent: spent.dividedBy(row.limitAmount).times(100).toFixed(2) };
        }) };
      }
      case "recent_transactions": {
        const rows = await tx.transaction.findMany({ where: { userId }, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], take: query.limit, select: { id: true, description: true, amount: true, type: true, occurredOn: true } });
        return { kind: "RECENT" as const, rows: rows.map((row) => ({ ...row, amount: row.amount.toFixed(2), occurredOn: row.occurredOn.toISOString().slice(0, 10) })) };
      }
    }
  }, { isolationLevel: "RepeatableRead" });
}

export async function getPendingAction(userId: string, sender: string) {
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.pendingTelegramAction.findFirst({ where: { userId, telegramUserId: sender, consumedAt: null, expiresAt: { gt: new Date() } } });
  });
}

export async function getTelegramBills(userId: string, sender: string, filter?: { name: string; includeCompleted?: boolean } | { next: true; installmentsOnly?: boolean } | { ids: string[] } | { all: true }, now = new Date()) {
  const billName = filter && "name" in filter ? z.string().trim().min(1).max(80).parse(filter.name) : undefined;
  const next = filter && "next" in filter;
  const start = parseDate(todayInMalaysia(now));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 30);
  const ids = filter && "ids" in filter ? filter.ids.map((id) => idSchema.parse(id)) : undefined;
  const selection: Prisma.RecurringBillWhereInput = ids ? { id: { in: ids } }
    : billName ? { name: { equals: billName, mode: "insensitive" } }
    : filter && "all" in filter ? {} : { nextDueOn: next ? { gte: start } : { lt: end } };
  const allowCompleted = ids || (filter && "name" in filter && filter.includeCompleted);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const rows = await tx.recurringBill.findMany({
      where: {
        userId, ...(allowCompleted ? { OR: [{ active: true }, { completed: true }] } : { active: true }), ...selection,
        ...(filter && "next" in filter && filter.installmentsOnly ? { OR: [{ paymentLimit: { gt: 1 } }, { endsOn: { not: null } }] } : {}),
      },
      select: { id: true, name: true, amount: true, nextDueOn: true, cadence: true, version: true, dayOfMonth: true,
        active: true, completed: true, paymentLimit: true, endsOn: true, paymentsMade: true },
      orderBy: [{ nextDueOn: "asc" }, { id: "asc" }], take: next ? 1 : 11,
    });
    return rows.map((row) => {
      const next = row.active ? billAfterPayment(row) : null;
      const endsOn = row.endsOn?.toISOString().slice(0, 10) ?? null;
      return {
        ...row, amount: row.amount.toFixed(2), nextDueOn: row.nextDueOn.toISOString().slice(0, 10), endsOn,
        progress: row.paymentLimit || endsOn ? billScheduleLabel({ ...row, endsOn }) : "",
        scheduleAfter: next ? {
          nextDueOn: next.active ? next.nextDueOn.toISOString().slice(0, 10) : null,
          progress: row.paymentLimit || endsOn ? billScheduleLabel({ ...row, endsOn, paymentsMade: next.paymentsMade }) : "",
        } : undefined,
      };
    });
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

export function replacePendingAction(userId: string, sender: string, kind: "PROPOSAL" | "CLARIFICATION", input: unknown, updateId?: number): Promise<PendingTelegramAction>;
export function replacePendingAction(userId: string, sender: string, kind: "PROPOSAL" | "CLARIFICATION", input: unknown, updateId: number, clarificationId: string | undefined): Promise<PendingTelegramAction | null>;
export async function replacePendingAction(userId: string, sender: string, kind: "PROPOSAL" | "CLARIFICATION", input: unknown, updateId?: number, clarificationId?: string) {
  const payload = kind === "PROPOSAL" ? pendingProposalSchema.parse(input) : pendingClarificationSchema.parse(input);
  if (clarificationId) actionId.parse(clarificationId);
  const id = updateId === undefined ? undefined : pendingIdForUpdate(sender, updateId);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    if (id) {
      const existing = await tx.pendingTelegramAction.findFirst({ where: { id, userId, telegramUserId: sender } });
      if (existing) return existing;
    }
    const now = new Date();
    if (clarificationId && !await tx.pendingTelegramAction.findFirst({
      where: { id: clarificationId, userId, telegramUserId: sender, kind: "CLARIFICATION", consumedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    })) return null;
    await tx.pendingTelegramAction.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now, payload: Prisma.JsonNull } });
    return tx.pendingTelegramAction.create({ data: { ...(id ? { id } : {}), userId, telegramUserId: sender, kind, payload, expiresAt: new Date(now.getTime() + ttl) } });
  });
}

export async function cancelPendingAction(userId: string, sender: string, id?: string) {
  if (id !== undefined) actionId.parse(id);
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    return tx.pendingTelegramAction.updateMany({ where: { userId, telegramUserId: sender, consumedAt: null, ...(id ? { id, expiresAt: { gt: new Date() } } : {}) }, data: { consumedAt: new Date(), payload: Prisma.JsonNull } });
  });
}

async function insertTelegramTransaction(tx: Tx, userId: string, proposed: z.output<typeof transactionSchema>, createdAt: Date) {
  if (!await tx.category.findFirst({ where: { id: proposed.categoryId, userId, transactionType: proposed.type }, select: { id: true } })) throw new TelegramAccessError();
  const record = await tx.transaction.create({
    data: { ...proposed, amount: new Decimal(proposed.amount), occurredOn: parseDate(proposed.occurredOn), createdAt, userId, source: "TELEGRAM" },
    include: { category: { select: { name: true } } },
  });
  return { id: record.id, categoryName: record.category.name, amount: record.amount.toFixed(2), type: record.type, description: record.description, occurredOn: record.occurredOn.toISOString().slice(0, 10) };
}

export async function approvePendingAction(userId: string, sender: string, id: string) {
  actionId.parse(id);
  return getDatabase().$transaction(async (tx) => {
    const connection = await authorizeTelegram(tx, userId, sender);
    const now = new Date();
    const where = { id, userId, telegramUserId: sender, kind: "PROPOSAL" as const, consumedAt: null, expiresAt: { gt: now } };
    const row = await tx.pendingTelegramAction.findFirst({ where, select: { payload: true } });
    if (!row) return null;
    const claimed = await tx.pendingTelegramAction.updateMany({ where, data: { consumedAt: now, payload: Prisma.JsonNull } });
    if (claimed.count !== 1) return null;
    const payload = pendingProposalSchema.parse(row.payload);
    if ("operation" in payload) {
      if (payload.operation === "create_bill") {
        const bill = payload.bill;
        if (!await tx.category.findFirst({ where: { id: bill.categoryId, userId, transactionType: "EXPENSE" }, select: { id: true } })) throw new TelegramAccessError();
        if (await tx.recurringBill.findFirst({ where: { userId, active: true, name: { equals: bill.name, mode: "insensitive" } }, select: { id: true } })) return { kind: "BILL_CHANGED" as const };
        const nextDueOn = parseDate(bill.nextDueOn);
        const created = await tx.recurringBill.create({
          data: { ...bill, userId, active: true, amount: new Decimal(bill.amount), nextDueOn,
            endsOn: bill.endsOn ? parseDate(bill.endsOn) : null, dayOfMonth: nextDueOn.getUTCDate() },
          select: { id: true, name: true, amount: true, nextDueOn: true },
        });
        return { kind: "BILL_CREATED" as const, id: created.id, name: created.name, amount: created.amount.toFixed(2), nextDueOn: created.nextDueOn.toISOString().slice(0, 10) };
      }
      if (payload.operation === "pay_bill") {
        const result = await saveBillPayment(tx, userId, payload.billId, payload.version, payload.payment, "TELEGRAM", payload.nextDueOn);
        if (!result) return { kind: "BILL_CHANGED" as const };
        return {
          kind: "BILL_PAID" as const, billId: payload.billId,
          payment: { id: result.record.id, description: result.record.description, amount: result.record.amount.toFixed(2),
            occurredOn: result.record.occurredOn.toISOString().slice(0, 10) },
          nextDueOn: result.nextDueOn?.toISOString().slice(0, 10) ?? null,
        };
      }
      return applyFinanceMutation(tx, userId, connection.id, payload);
    }
    const saved = [];
    for (const [index, proposed] of payload.transactions.entries()) {
      saved.push(await insertTelegramTransaction(tx, userId, proposed, new Date(now.getTime() - payload.transactions.length + index + 1)));
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
    const recent = await tx.transaction.findMany({ where, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], take: 5, select: { id: true, amount: true, type: true, description: true, occurredOn: true } });
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
