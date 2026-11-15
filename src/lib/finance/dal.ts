import "server-only";
import { requireUser, AccessError } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import type { Prisma, Transaction } from "@/generated/prisma/client";
import { budgetSchema, categorySchema, filterSchema, idSchema, monthSchema, transactionSchema } from "./validation";
import { monthRange, parseDate, shiftMonth } from "./dates";
import { budgetProgress, Decimal } from "./money";

export class FinanceError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "CATEGORY_MISMATCH" | "DEMO_READ_ONLY") { super(code); }
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
  return getDatabase().$transaction(async (tx) => {
    await checkCategory(tx, userId, data.categoryId, data.type);
    const row = await tx.transaction.create({ data: { ...data, userId, amount: new Decimal(data.amount), occurredOn: parseDate(data.occurredOn), source: "WEB" }, include: { category: { select: { name: true } } } });
    return serializeTransaction(row);
  });
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
