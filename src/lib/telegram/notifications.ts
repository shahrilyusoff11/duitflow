import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { monthRange, parseDate, todayInMalaysia } from "@/lib/finance/dates";
import { Decimal, formatMyr } from "@/lib/finance/money";
import { authorizeTelegram, TelegramAccessError } from "./access";
import { notificationFields } from "./records";
import type { NotificationSettings } from "./schemas";
import { sendMessage, TelegramTransportError, TELEGRAM_FETCH_TIMEOUT_MS } from "./transport";

type Tx = Prisma.TransactionClient;
type Connection = { id: string; userId: string; telegramUserId: string };
type Event = { eventKey: string; text: string; expiresAt: Date };

const expenses = (userId: string, start: Date, end: Date) => ({
  userId, type: "EXPENSE" as const, occurredOn: { gte: start, lt: end },
});
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const money = (amount: Decimal) => formatMyr(amount.toFixed(2));
function plusDays(date: Date, count: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + count);
  return result;
}

async function readBudgetRows(tx: Tx, userId: string, month: string, today: Date) {
  const { start } = monthRange(month);
  const budgets = await tx.budget.findMany({
    where: { userId, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 },
    select: { id: true, categoryId: true, limitAmount: true, category: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  const totals = await tx.transaction.groupBy({
    by: ["categoryId"],
    where: { ...expenses(userId, start, plusDays(today, 1)), categoryId: { in: budgets.map((row) => row.categoryId) } },
    _sum: { amount: true },
  });
  const spent = new Map(totals.map((row) => [row.categoryId, row._sum.amount ?? new Decimal(0)]));
  return budgets.map((row) => ({ ...row, spent: spent.get(row.categoryId) ?? new Decimal(0) }));
}

async function readUpcomingBills(tx: Tx, userId: string, start: Date, end: Date, limit?: number) {
  return tx.recurringBill.findMany({
    where: { userId, active: true, nextDueOn: { gte: start, lt: end } },
    select: { id: true, name: true, amount: true, nextDueOn: true },
    orderBy: [{ nextDueOn: "asc" }, { id: "asc" }], take: limit,
  });
}

async function readWeeklySpending(tx: Tx, userId: string, start: Date, end: Date) {
  const rows = await tx.transaction.groupBy({
    by: ["categoryId"], where: expenses(userId, start, end), _sum: { amount: true },
    orderBy: [{ _sum: { amount: "desc" } }, { categoryId: "asc" }],
  });
  const total = rows.reduce((sum, row) => sum.plus(row._sum.amount ?? 0), new Decimal(0));
  const top = rows[0];
  const category = top ? await tx.category.findFirst({ where: { id: top.categoryId, userId }, select: { name: true } }) : null;
  return { total, top: top?._sum.amount && category ? `${category.name} · ${money(top._sum.amount)}` : "Tiada belanja direkod" };
}

async function collectEvents(tx: Tx, userId: string, settings: NotificationSettings, today: Date): Promise<Event[]> {
  const events: Event[] = [];
  const month = isoDate(today).slice(0, 7);
  const day = today.getUTCDay() || 7;
  const wantsDigest = settings.weeklyDigestDay !== null && day >= settings.weeklyDigestDay;
  const budgets = wantsDigest || settings.budgetReminderPercent !== null ? await readBudgetRows(tx, userId, month, today) : [];
  if (settings.billReminderDays !== null) {
    const bills = await readUpcomingBills(tx, userId, today, plusDays(today, settings.billReminderDays + 1));
    for (const bill of bills) {
      const due = isoDate(bill.nextDueOn);
      events.push({ eventKey: `bill:${bill.id}:${due}`, expiresAt: plusDays(bill.nextDueOn, 31),
        text: `Peringatan bil\n${bill.name} · ${money(bill.amount)} · matang ${due}` });
    }
  }
  if (settings.budgetReminderPercent !== null) {
    for (const budget of budgets) {
      const percent = budget.spent.times(100).div(budget.limitAmount);
      if (percent.lt(settings.budgetReminderPercent)) continue;
      events.push({ eventKey: `budget:${budget.id}:${month}`, expiresAt: plusDays(monthRange(month).end, 14),
        text: `Peringatan bajet · ${month}\n${budget.category.name} · ${percent.toFixed(1)}% daripada had\n${money(budget.spent)} / ${money(budget.limitAmount)} · Baki ${money(budget.limitAmount.minus(budget.spent))}` });
    }
  }
  if (wantsDigest) {
    const monday = plusDays(today, 1 - day);
    const start = plusDays(monday, -7);
    const spending = await readWeeklySpending(tx, userId, start, monday);
    const upcoming = await readUpcomingBills(tx, userId, today, plusDays(today, 7), 11);
    const remaining = budgets.slice(0, 10).map((row) => `• ${row.category.name}: ${money(row.limitAmount.minus(row.spent))}`);
    const bills = upcoming.slice(0, 10).map((bill) => `• ${bill.name} · ${money(bill.amount)} · ${isoDate(bill.nextDueOn)}`);
    events.push({
      eventKey: `week:${isoDate(monday)}`, expiresAt: plusDays(monday, 21),
      text: [
        `Ringkasan mingguan · ${isoDate(start)} hingga ${isoDate(plusDays(monday, -1))}`,
        `Jumlah belanja direkod: ${money(spending.total)}`,
        `Kategori tertinggi: ${spending.top}`,
        `Baki bajet ${month} setakat ${isoDate(today)}`, ...(remaining.length ? remaining : ["Tiada bajet bulan ini."]),
        "Bil dalam 7 hari", ...(bills.length ? bills : ["Tiada bil akan datang."]),
        ...(budgets.length > 10 || upcoming.length > 10 ? ["Lihat senarai penuh di DuitFlow."] : []),
      ].join("\n"),
    });
  }
  return events;
}

async function scopedConnection(tx: Tx, connection: Connection) {
  const { id } = await authorizeTelegram(tx, connection.userId, connection.telegramUserId);
  if (id !== connection.id) throw new TelegramAccessError();
  return tx.telegramConnection.findFirstOrThrow({
    where: { id, userId: connection.userId }, select: { ...notificationFields, notificationVersion: true },
  });
}

async function claimDelivery(connection: Connection, version: number, event: Event, now: Date) {
  return getDatabase().$transaction(async (tx) => {
    if ((await scopedConnection(tx, connection)).notificationVersion !== version) return null;
    const key = { connectionId: connection.id, eventKey: event.eventKey };
    const created = await tx.telegramDelivery.createMany({
      data: { ...key, expiresAt: event.expiresAt }, skipDuplicates: true,
    });
    if (created.count) return 1;
    const previous = await tx.telegramDelivery.findFirst({
      where: { ...key, retryAt: { lte: now }, attempts: { lt: 3 } }, select: { attempts: true },
    });
    if (!previous) return null;
    await tx.telegramDelivery.update({ where: { connectionId_eventKey: key }, data: { retryAt: null, attempts: { increment: 1 } } });
    return previous.attempts + 1;
  });
}

async function sendClaimedEvent(connection: Connection, version: number, event: Event, now: Date, attempt: number) {
  const current = await getDatabase().telegramConnection.findFirst({
    where: { ...connection, notificationVersion: version, user: { isDemo: false } }, select: { id: true },
  });
  if (!current) return "skipped";
  try {
    await sendMessage(connection.telegramUserId, event.text);
    return "sent";
  } catch (error) {
    // A timeout may mean Telegram already delivered. Only an explicit rate
    // limit is proof of rejection, so only that response reopens a claim.
    if (error instanceof TelegramTransportError && error.retryAfterSeconds && attempt < 3) {
      await getDatabase().telegramDelivery.updateMany({
        where: { connectionId: connection.id, eventKey: event.eventKey, attempts: attempt, connection: { userId: connection.userId } },
        data: { retryAt: new Date(now.getTime() + error.retryAfterSeconds * 1000) },
      });
    }
    return "failed";
  }
}

export async function runTelegramNotifications(now = new Date()) {
  const db = getDatabase();
  const today = parseDate(todayInMalaysia(now));
  const summary = { sent: 0, failed: 0, truncated: false };
  const deadline = performance.now() + 48_000;
  const hasTime = () => performance.now() + TELEGRAM_FETCH_TIMEOUT_MS < deadline;
  await db.$executeRaw`DELETE FROM "TelegramDelivery" WHERE ("connectionId", "eventKey") IN (
    SELECT "connectionId", "eventKey" FROM "TelegramDelivery" WHERE "expiresAt" < ${now} LIMIT 500
  )`;
  let cursor = "";
  while (hasTime()) {
    // This scan discovers opted-in identities only. Each account's data and
    // delivery claims are read under the same connection authorization as chat.
    const connections = await db.telegramConnection.findMany({
      where: { id: { gt: cursor }, user: { isDemo: false }, OR: [
        { billReminderDays: { not: null } }, { budgetReminderPercent: { not: null } }, { weeklyDigestDay: { not: null } },
      ] },
      select: { id: true, userId: true, telegramUserId: true }, orderBy: { id: "asc" }, take: 50,
    });
    if (!connections.length) return summary;
    for (const connection of connections) {
      if (!hasTime()) break;
      try {
        const { version, events } = await db.$transaction(async (tx) => {
          const settings = await scopedConnection(tx, connection);
          return { version: settings.notificationVersion, events: await collectEvents(tx, connection.userId, settings, today) };
        }, { isolationLevel: "RepeatableRead" });
        for (const event of events) {
          if (!hasTime()) break;
          const attempt = await claimDelivery(connection, version, event, now);
          if (attempt === null) continue;
          const status = await sendClaimedEvent(connection, version, event, now, attempt);
          if (status !== "skipped") summary[status]++;
        }
      } catch (error) {
        if (!(error instanceof TelegramAccessError)) throw error;
      }
      cursor = connection.id;
    }
  }
  return { ...summary, truncated: true };
}
