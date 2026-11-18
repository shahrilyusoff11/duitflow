import "server-only";
import { requireUser, AccessError } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import type { Prisma, Transaction } from "@/generated/prisma/client";
import { billPaymentSchema, billSchema, billVersionSchema, budgetSchema, categorySchema, filterSchema, idSchema, monthSchema, transactionSchema } from "./validation";
import { monthRange, parseDate, shiftMonth, todayInMalaysia } from "./dates";
import { budgetProgress, Decimal } from "./money";
import { billDueDate, billsDueBetween } from "./bill-schedule";
import type { z } from "zod";

export class FinanceError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "CATEGORY_MISMATCH" | "DEMO_READ_ONLY" | "BILL_CHANGED") { super(code); }
}

async function authorize(userId: string, write = false) {
  await requireUser(userId);
  idSchema.parse(userId);
  if (write) {
    const user = await getDatabase().user.findUnique({ where: { id: userId }, select: { isDemo: true } });
    if (!user) throw new AccessError("UNAUTHENTICATED");
    if (user.isDemo) throw new FinanceError("DEMO_READ_ONLY");
  }
}

async function checkCategory(db: Prisma.TransactionClient, userId: string, id: string, type: "INCOME" | "EXPENSE") {
  const category = await db.category.findFirst({ where: { id, userId, transactionType: type }, select: { id: true } });
  if (!category) throw new FinanceError("CATEGORY_MISMATCH");
}

function found(count: number) { if (count !== 1) throw new FinanceError("NOT_FOUND"); }

export async function listCategories(userId: string) {
  await authorize(userId);
  return getDatabase().category.findMany({ where: { userId }, select: { id: true, name: true, transactionType: true }, orderBy: [{ transactionType: "asc" }, { name: "asc" }] });
}

export async function createCategory(userId: string, input: unknown) {
  await authorize(userId, true);
  const data = categorySchema.parse(input);
  return getDatabase().category.create({ data: { ...data, userId }, select: { id: true } });
}

export async function updateCategory(userId: string, categoryId: string, input: unknown) {
  await authorize(userId, true);
  const id = idSchema.parse(categoryId);
  const data = categorySchema.parse(input);
  found((await getDatabase().category.updateMany({ where: { id, userId }, data })).count);
}

export async function deleteCategory(userId: string, categoryId: string) {
  await authorize(userId, true);
  const id = idSchema.parse(categoryId);
  // The reviewed FK restricts deletion/type changes while used. Never cascade finance records.
  found((await getDatabase().category.deleteMany({ where: { id, userId } })).count);
}

function serializeTransaction(row: Transaction & { category: { name: string } }) {
  return { id: row.id, categoryId: row.categoryId, categoryName: row.category.name, type: row.type,
    amount: row.amount.toFixed(2), description: row.description, occurredOn: row.occurredOn.toISOString().slice(0, 10),
    source: row.source, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function createTransaction(userId: string, input: unknown) {
  await authorize(userId, true);
  const data = transactionSchema.parse(input);
  return getDatabase().$transaction((tx) => insertWebTransaction(tx, userId, data));
}

async function insertWebTransaction(tx: Prisma.TransactionClient, userId: string, data: z.output<typeof transactionSchema>) {
  await checkCategory(tx, userId, data.categoryId, data.type);
  const row = await tx.transaction.create({ data: { ...data, userId, amount: new Decimal(data.amount), occurredOn: parseDate(data.occurredOn), source: "WEB" }, include: { category: { select: { name: true } } } });
  return serializeTransaction(row);
}

export async function updateTransaction(userId: string, transactionId: string, input: unknown) {
  await authorize(userId, true);
  const id = idSchema.parse(transactionId);
  const data = transactionSchema.parse(input);
  await getDatabase().$transaction(async (tx) => {
    await checkCategory(tx, userId, data.categoryId, data.type);
    found((await tx.transaction.updateMany({ where: { id, userId }, data: { ...data, amount: new Decimal(data.amount), occurredOn: parseDate(data.occurredOn) } })).count);
  });
}

export async function deleteTransaction(userId: string, transactionId: string) {
  await authorize(userId, true);
  const id = idSchema.parse(transactionId);
  found((await getDatabase().transaction.deleteMany({ where: { id, userId } })).count);
}

export async function getTransaction(userId: string, transactionId: string) {
  await authorize(userId);
  const id = idSchema.parse(transactionId);
  const row = await getDatabase().transaction.findFirst({ where: { id, userId }, include: { category: { select: { name: true } } } });
  if (!row) throw new FinanceError("NOT_FOUND");
  return serializeTransaction(row);
}

export async function listTransactions(userId: string, input: unknown = {}) {
  await authorize(userId);
  const filters = filterSchema.parse(input);
  const where: Prisma.TransactionWhereInput = {
    userId, categoryId: filters.categoryId, type: filters.type,
    occurredOn: { ...(filters.from ? { gte: parseDate(filters.from) } : {}), ...(filters.to ? { lte: parseDate(filters.to) } : {}) },
    ...(filters.search ? { description: { contains: filters.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await getDatabase().$transaction([
    getDatabase().transaction.findMany({ where, include: { category: { select: { name: true } } }, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    getDatabase().transaction.count({ where }),
  ], { isolationLevel: "RepeatableRead" });
  return { rows: rows.map(serializeTransaction), total, page: filters.page, pageSize: filters.pageSize };
}

export async function createBudget(userId: string, input: unknown) {
  await authorize(userId, true);
  const data = budgetSchema.parse(input);
  const start = monthRange(data.period).start;
  return getDatabase().$transaction(async (tx) => {
    await checkCategory(tx, userId, data.categoryId, "EXPENSE");
    return tx.budget.create({ data: { userId, categoryId: data.categoryId, categoryType: "EXPENSE", year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, limitAmount: new Decimal(data.limitAmount), warningAt: data.warningAt }, select: { id: true } });
  });
}

export async function updateBudget(userId: string, budgetId: string, input: unknown) {
  await authorize(userId, true);
  const id = idSchema.parse(budgetId);
  const data = budgetSchema.parse(input);
  const start = monthRange(data.period).start;
  await getDatabase().$transaction(async (tx) => {
    await checkCategory(tx, userId, data.categoryId, "EXPENSE");
    found((await tx.budget.updateMany({ where: { id, userId }, data: { categoryId: data.categoryId, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, limitAmount: new Decimal(data.limitAmount), warningAt: data.warningAt } })).count);
  });
}

export async function deleteBudget(userId: string, budgetId: string) {
  await authorize(userId, true);
  const id = idSchema.parse(budgetId);
  found((await getDatabase().budget.deleteMany({ where: { id, userId } })).count);
}

const billSelect = {
  id: true, name: true, amount: true, categoryId: true, cadence: true, nextDueOn: true,
  active: true, version: true, category: { select: { name: true } },
} satisfies Prisma.RecurringBillSelect;

function serializeBill(row: Prisma.RecurringBillGetPayload<{ select: typeof billSelect }>) {
  const { category, ...bill } = row;
  return { ...bill, categoryName: category.name, amount: bill.amount.toFixed(2), nextDueOn: bill.nextDueOn.toISOString().slice(0, 10) };
}

export async function listBills(userId: string) {
  await authorize(userId);
  const rows = await getDatabase().recurringBill.findMany({ where: { userId }, select: billSelect, orderBy: [{ active: "desc" }, { nextDueOn: "asc" }, { id: "asc" }] });
  return rows.map(serializeBill);
}

export async function getBill(userId: string, billId: string) {
  await authorize(userId);
  const row = await getDatabase().recurringBill.findFirst({ where: { id: idSchema.parse(billId), userId }, select: billSelect });
  return row ? serializeBill(row) : null;
}

export async function getUpcomingBills(userId: string, now = new Date()) {
  await authorize(userId);
  const start = parseDate(todayInMalaysia(now));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 30);
  const rows = await getDatabase().recurringBill.findMany({
    where: { userId, active: true, nextDueOn: { lt: end } },
    select: { id: true, name: true, amount: true, cadence: true, nextDueOn: true, dayOfMonth: true },
    orderBy: [{ nextDueOn: "asc" }, { id: "asc" }],
  });
  let total = new Decimal(0);
  let overdue = 0;
  const occurrences = rows.flatMap((bill) => {
    if (bill.nextDueOn < start) overdue++;
    return billsDueBetween(bill, start, end).map((due) => {
      total = total.plus(bill.amount);
      return {
        id: bill.id, name: bill.name, amount: bill.amount.toFixed(2),
        dueOn: due.toISOString().slice(0, 10), canPay: due.getTime() === bill.nextDueOn.getTime(),
      };
    });
  });
  occurrences.sort((first, second) => first.dueOn.localeCompare(second.dueOn));
  return { occurrences, overdue, total: total.toFixed(2) };
}

export async function createBill(userId: string, input: unknown) {
  await authorize(userId, true);
  const data = billSchema.parse(input);
  const nextDueOn = parseDate(data.nextDueOn);
  return getDatabase().$transaction(async (tx) => {
    await checkCategory(tx, userId, data.categoryId, "EXPENSE");
    return tx.recurringBill.create({
      data: { ...data, userId, amount: new Decimal(data.amount), nextDueOn, dayOfMonth: nextDueOn.getUTCDate() }, select: { id: true },
    });
  });
}

export async function updateBill(userId: string, billId: string, expectedVersion: unknown, input: unknown) {
  await authorize(userId, true);
  const where = { id: idSchema.parse(billId), userId, version: billVersionSchema.parse(expectedVersion) };
  const data = billSchema.parse(input);
  const nextDueOn = parseDate(data.nextDueOn);
  await getDatabase().$transaction(async (tx) => {
    const current = await tx.recurringBill.findFirst({ where, select: { nextDueOn: true, dayOfMonth: true } });
    if (!current) throw new FinanceError("BILL_CHANGED");
    await checkCategory(tx, userId, data.categoryId, "EXPENSE");
    const dayOfMonth = nextDueOn.getTime() === current.nextDueOn.getTime() ? current.dayOfMonth : nextDueOn.getUTCDate();
    const { count } = await tx.recurringBill.updateMany({ where, data: { ...data, amount: new Decimal(data.amount), nextDueOn, dayOfMonth, version: { increment: 1 } } });
    if (count !== 1) throw new FinanceError("BILL_CHANGED");
  });
}

export async function deleteBill(userId: string, billId: string, expectedVersion: unknown) {
  await authorize(userId, true);
  const { count } = await getDatabase().recurringBill.deleteMany({ where: { id: idSchema.parse(billId), userId, version: billVersionSchema.parse(expectedVersion) } });
  if (count !== 1) throw new FinanceError("BILL_CHANGED");
}

export async function recordBillPayment(userId: string, billId: string, expectedVersion: unknown, input: unknown) {
  await authorize(userId, true);
  const where = { id: idSchema.parse(billId), userId, active: true, version: billVersionSchema.parse(expectedVersion) };
  const payment = billPaymentSchema.parse(input);
  return getDatabase().$transaction(async (tx) => {
    const bill = await tx.recurringBill.findFirst({ where, select: { categoryId: true, nextDueOn: true, dayOfMonth: true, cadence: true } });
    if (!bill) throw new FinanceError("BILL_CHANGED");
    const nextDueOn = billDueDate(bill, 1);
    const schedule = nextDueOn.getUTCFullYear() <= 2100 ? { nextDueOn } : { active: false };
    // Claim this version before inserting. A stale form cannot record another payment.
    const { count } = await tx.recurringBill.updateMany({ where, data: { ...schedule, version: { increment: 1 } } });
    if (count !== 1) throw new FinanceError("BILL_CHANGED");
    return insertWebTransaction(tx, userId, { ...payment, categoryId: bill.categoryId, type: "EXPENSE" });
  });
}

async function readBudgetProgress(tx: Prisma.TransactionClient, userId: string, period: string) {
  const { start, end } = monthRange(period);
  const budgets = await tx.budget.findMany({ where: { userId, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 }, include: { category: { select: { name: true } } }, orderBy: { category: { name: "asc" } } });
  const expenses = await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", occurredOn: { gte: start, lt: end } }, _sum: { amount: true } });
  const spent = new Map(expenses.map((row) => [row.categoryId, row._sum.amount?.toFixed(2) ?? "0.00"]));
  return budgets.map((row) => {
    const amount = spent.get(row.categoryId) ?? "0.00";
    return { id: row.id, categoryId: row.categoryId, categoryName: row.category.name, period, limitAmount: row.limitAmount.toFixed(2), warningAt: row.warningAt, spent: amount, ...budgetProgress(amount, row.limitAmount.toFixed(2), row.warningAt) };
  });
}

export async function listBudgets(userId: string, month: string) {
  await authorize(userId);
  const period = monthSchema.parse(month);
  return getDatabase().$transaction((tx) => readBudgetProgress(tx, userId, period), { isolationLevel: "RepeatableRead" });
}

export async function getDashboard(userId: string, month: string) {
  await authorize(userId);
  const period = monthSchema.parse(month);
  const { start, end } = monthRange(period);
  // Bounded six-month trend, including months without records. SQL aggregates
  // transfer totals rather than unbounded transaction history to the server.
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(period, index - 5));
  const trendStart = new Date(`${months[0]}-01T00:00:00.000Z`);
  return getDatabase().$transaction(async (tx) => {
    const totals = await tx.transaction.groupBy({ by: ["type"], where: { userId, occurredOn: { gte: start, lt: end } }, _sum: { amount: true } });
    const income = totals.find((row) => row.type === "INCOME")?._sum.amount ?? new Decimal(0);
    const expense = totals.find((row) => row.type === "EXPENSE")?._sum.amount ?? new Decimal(0);
    const grouped = await tx.transaction.groupBy({ by: ["categoryId"], where: { userId, type: "EXPENSE", occurredOn: { gte: start, lt: end } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } });
    const categories = await tx.category.findMany({ where: { userId, id: { in: grouped.map((row) => row.categoryId) } }, select: { id: true, name: true } });
    const daily = await tx.transaction.groupBy({ by: ["occurredOn", "type"], where: { userId, occurredOn: { gte: trendStart, lt: end } }, _sum: { amount: true } });
    const trend = months.map((month) => {
      const sum = (type: "INCOME" | "EXPENSE") => daily.filter((row) => row.type === type && row.occurredOn.toISOString().startsWith(month)).reduce((total, row) => total.plus(row._sum.amount ?? 0), new Decimal(0));
      return { month, income: sum("INCOME").toFixed(2), expense: sum("EXPENSE").toFixed(2) };
    });
    const recent = await tx.transaction.findMany({ where: { userId, occurredOn: { gte: start, lt: end } }, include: { category: { select: { name: true } } }, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], take: 5 });
    return { income: income.toFixed(2), expense: expense.toFixed(2), net: income.minus(expense).toFixed(2),
      breakdown: grouped.map((row) => ({ categoryId: row.categoryId, name: categories.find((category) => category.id === row.categoryId)!.name, amount: row._sum.amount!.toFixed(2) })),
      trend, recent: recent.map(serializeTransaction), budgets: await readBudgetProgress(tx, userId, period) };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
