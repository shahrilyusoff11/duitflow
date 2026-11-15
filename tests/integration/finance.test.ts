import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { fixtureSessionCookie } from "../helpers/session-cookie";
import { createAuth, type DuitFlowAuth } from "../../src/lib/auth/create-auth";
import type { PrismaClient } from "../../src/generated/prisma/client";

const context = vi.hoisted(() => ({ requestHeaders: new Headers(), auth: undefined as DuitFlowAuth | undefined, database: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => context.requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => context.auth }));
vi.mock("@/lib/db", () => ({ getDatabase: () => context.database }));

import * as finance from "../../src/lib/finance/dal";
import { mutateFinance } from "../../src/app/(protected)/actions";

const environment = {
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "synthetic-finance-secret-at-least-32-characters",
  GITHUB_CLIENT_ID: "synthetic-client", GITHUB_CLIENT_SECRET: "synthetic-secret",
};
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let alice: string, bob: string, expense: string, income: string, foreignCategory: string;

async function signIn(userId: string) {
  const session = await db.prisma.session.create({ data: { userId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  context.requestHeaders = new Headers({ cookie: fixtureSessionCookie(session.token, environment.BETTER_AUTH_SECRET) });
}
const transaction = (categoryId: string, amount = "12.50", occurredOn = "2026-11-01", type = "EXPENSE") => ({ categoryId, amount, occurredOn, type, description: "Synthetic record" });

beforeAll(async () => {
  db = await createTestDatabase();
  Object.entries(environment).forEach(([key, value]) => vi.stubEnv(key, value));
  vi.stubEnv("DATABASE_URL", db.connectionString);
  context.database = db.prisma;
  context.auth = createAuth(db.prisma, environment);
});
beforeEach(async () => {
  await db.prisma.$executeRaw`TRUNCATE "User" CASCADE`;
  alice = (await db.prisma.user.create({ data: { name: "Alice", email: "alice@example.test" } })).id;
  bob = (await db.prisma.user.create({ data: { name: "Bob", email: "bob@example.test" } })).id;
  expense = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, transactionType: "EXPENSE" } })).id;
  income = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, transactionType: "INCOME" } })).id;
  foreignCategory = (await db.prisma.category.findFirstOrThrow({ where: { userId: bob, transactionType: "EXPENSE" } })).id;
  await signIn(alice);
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });

describe("finance CRUD through real sessions and Prisma", () => {
  it("creates, reads, updates and deletes a category and transaction with string money", async () => {
    const category = await finance.createCategory(alice, { name: "Synthetic category", transactionType: "EXPENSE" });
    await finance.updateCategory(alice, category.id, { name: "Renamed", transactionType: "EXPENSE" });
    expect(await finance.listCategories(alice)).toContainEqual({ id: category.id, name: "Renamed", transactionType: "EXPENSE" });
    const row = await finance.createTransaction(alice, transaction(category.id, "12 ringgit 50 sen"));
    expect(row).toMatchObject({ amount: "12.50", source: "WEB", occurredOn: "2026-11-01" });
    await finance.updateTransaction(alice, row.id, { ...transaction(category.id, "RM0.30", "2026-10-31"), description: "Changed" });
    expect(await finance.getTransaction(alice, row.id)).toMatchObject({ amount: "0.30", description: "Changed", occurredOn: "2026-10-31" });
    await expect(finance.deleteCategory(alice, category.id)).rejects.toMatchObject({ code: "P2003" });
    await expect(finance.updateCategory(alice, category.id, { name: "Renamed", transactionType: "INCOME" })).rejects.toMatchObject({ code: "P2003" });
    await finance.deleteTransaction(alice, row.id);
    await expect(finance.getTransaction(alice, row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await finance.deleteCategory(alice, category.id);
  });

  it("rejects category/type mismatches and cross-user category references for create and edit", async () => {
    const row = await finance.createTransaction(alice, transaction(expense));
    for (const category of [income, foreignCategory]) {
      await expect(finance.createTransaction(alice, transaction(category))).rejects.toMatchObject({ code: "CATEGORY_MISMATCH" });
      await expect(finance.updateTransaction(alice, row.id, transaction(category))).rejects.toMatchObject({ code: "CATEGORY_MISMATCH" });
      await expect(finance.createBudget(alice, { categoryId: category, period: "2026-11", limitAmount: "100", warningAt: 80 })).rejects.toMatchObject({ code: "CATEGORY_MISMATCH" });
    }
    expect((await finance.getTransaction(alice, row.id)).categoryId).toBe(expense);
    expect(await db.prisma.transaction.count()).toBe(1);
  });

  it("scopes all reads and refuses cross-user targets and userId impersonation", async () => {
    await signIn(bob);
    const row = await finance.createTransaction(bob, transaction(foreignCategory));
    const budget = await finance.createBudget(bob, { categoryId: foreignCategory, period: "2026-11", limitAmount: "100", warningAt: 80 });
    await signIn(alice);
    expect((await finance.listTransactions(alice)).rows).toEqual([]);
    await expect(finance.listTransactions(undefined as unknown as string)).rejects.toThrow();
    expect(await finance.listBudgets(alice, "2026-11")).toEqual([]);
    expect((await finance.getDashboard(alice, "2026-11")).expense).toBe("0.00");
    await expect(finance.getTransaction(alice, row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.updateTransaction(alice, row.id, transaction(expense))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.deleteTransaction(alice, row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.updateCategory(alice, foreignCategory, { name: "Stolen", transactionType: "EXPENSE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.deleteCategory(alice, foreignCategory)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.updateBudget(alice, budget.id, { categoryId: expense, period: "2026-11", limitAmount: "1", warningAt: 80 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(finance.deleteBudget(alice, budget.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const entries = [
      () => finance.listCategories(bob), () => finance.createCategory(bob, {}), () => finance.updateCategory(bob, foreignCategory, {}), () => finance.deleteCategory(bob, foreignCategory),
      () => finance.listTransactions(bob), () => finance.getTransaction(bob, row.id), () => finance.createTransaction(bob, {}), () => finance.updateTransaction(bob, row.id, {}), () => finance.deleteTransaction(bob, row.id),
      () => finance.listBudgets(bob, "2026-11"), () => finance.createBudget(bob, {}), () => finance.updateBudget(bob, budget.id, {}), () => finance.deleteBudget(bob, budget.id), () => finance.getDashboard(bob, "2026-11"),
    ];
    for (const entry of entries) await expect(entry()).rejects.toMatchObject({ code: "FORBIDDEN" });
    context.requestHeaders = new Headers();
    for (const entry of entries) await expect(entry()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.prisma.transaction.findUniqueOrThrow({ where: { id: row.id } })).amount.toFixed(2)).toBe("12.50");
  });

  it("denies revoked sessions and demo writes", async () => {
    await db.prisma.user.update({ where: { id: alice }, data: { isDemo: true } });
    await expect(finance.createTransaction(alice, transaction(expense))).rejects.toMatchObject({ code: "DEMO_READ_ONLY" });
    await db.prisma.session.deleteMany({ where: { userId: alice } });
    await expect(finance.listTransactions(alice)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("filters inclusive dates, type, category and text with stable bounded pagination", async () => {
    for (const [amount, date] of [["1", "2026-10-31"], ["2", "2026-11-01"], ["3", "2026-11-01"], ["4", "2026-12-01"]]) await finance.createTransaction(alice, transaction(expense, amount, date));
    await finance.createTransaction(alice, transaction(income, "10", "2026-11-01", "INCOME"));
    const filters = { from: "2026-11-01", to: "2026-11-30", type: "EXPENSE", categoryId: expense, search: "SYNTHETIC", pageSize: 1 };
    const first = await finance.listTransactions(alice, filters);
    const second = await finance.listTransactions(alice, { ...filters, page: 2 });
    expect(first.total).toBe(2);
    expect(first.rows).toHaveLength(1);
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
    await expect(finance.listTransactions(alice, { pageSize: 51 })).rejects.toThrow();
  });

  it("computes exact monthly aggregates, breakdown, six-month trend and empty months", async () => {
    await finance.createTransaction(alice, transaction(expense, "0.10"));
    await finance.createTransaction(alice, transaction(expense, "0.20", "2026-11-30"));
    await finance.createTransaction(alice, transaction(income, "1000", "2026-11-01", "INCOME"));
    await finance.createTransaction(alice, transaction(expense, "200", "2026-10-31"));
    await finance.createTransaction(alice, transaction(expense, "300", "2026-12-01"));
    const result = await finance.getDashboard(alice, "2026-11");
    expect(result).toMatchObject({ income: "1000.00", expense: "0.30", net: "999.70" });
    expect(result.breakdown[0].amount).toBe("0.30");
    expect(result.trend).toHaveLength(6);
    expect(result.trend.at(-1)).toEqual({ month: "2026-11", income: "1000.00", expense: "0.30" });
    expect(result.trend.at(-2)?.expense).toBe("200.00");
    expect((await finance.getDashboard(alice, "2026-09"))).toMatchObject({ income: "0.00", expense: "0.00", net: "0.00", recent: [], breakdown: [] });
    expect(result.recent).toHaveLength(3);
  });

  it.each([["2026-12", "2026-12-31", "2027-01-01"], ["2024-02", "2024-02-29", "2024-03-01"]])("keeps date boundaries correct for %s", async (month, inside, outside) => {
    await finance.createTransaction(alice, transaction(expense, "1.25", inside));
    await finance.createTransaction(alice, transaction(expense, "10", outside));
    expect((await finance.getDashboard(alice, month)).expense).toBe("1.25");
  });

  it("maintains monthly budget uniqueness, thresholds and progress after edits/deletes", async () => {
    const input = { categoryId: expense, period: "2026-11", limitAmount: "100", warningAt: 80 };
    const budget = await finance.createBudget(alice, input);
    await expect(finance.createBudget(alice, input)).rejects.toMatchObject({ code: "P2002" });
    const expenseRow = await finance.createTransaction(alice, transaction(expense, "80"));
    expect((await finance.listBudgets(alice, "2026-11"))[0]).toMatchObject({ spent: "80.00", remaining: "20.00", status: "WARNING" });
    expect(await finance.listBudgets(alice, "2026-12")).toEqual([]);
    await finance.updateBudget(alice, budget.id, { ...input, limitAmount: "50", warningAt: 60 });
    expect((await finance.listBudgets(alice, "2026-11"))[0]).toMatchObject({ remaining: "-30.00", status: "EXCEEDED", percent: "160.0" });
    await expect(finance.deleteCategory(alice, expense)).rejects.toMatchObject({ code: "P2003" });
    await finance.deleteTransaction(alice, expenseRow.id);
    expect((await finance.listBudgets(alice, "2026-11"))[0]).toMatchObject({ spent: "0.00", remaining: "50.00", status: "OK" });
    await finance.deleteBudget(alice, budget.id);
    expect(await finance.listBudgets(alice, "2026-11")).toEqual([]);
  });

  it("keeps real session checks working after repeated constraint-error connection replacements", async () => {
    const input = { categoryId: expense, period: "2026-11", limitAmount: "100", warningAt: 80 };
    await finance.createBudget(alice, input);
    // pg discards a pooled connection after a SQL error. The replacement must
    // authenticate against the persisted session while its old socket drains.
    for (let attempt = 0; attempt < 20; attempt++) {
      await expect(finance.createBudget(alice, input)).rejects.toMatchObject({ code: "P2002" });
      expect(await finance.listBudgets(alice, "2026-11")).toMatchObject([{ limitAmount: "100.00" }]);
      await expect(finance.listBudgets(bob, "2026-11")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await db.prisma.budget.count({ where: { userId: alice } })).toBe(1);
    await db.prisma.session.deleteMany({ where: { userId: alice } });
    await expect(finance.listBudgets(alice, "2026-11")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("actions derive identity from the session, validate input and return safe failures", async () => {
    const form = new FormData();
    Object.entries({ operation: "createTransaction", ...transaction(expense), userId: bob, source: "TELEGRAM" }).forEach(([key, value]) => form.set(key, value));
    expect(await mutateFinance({ message: "", ok: false }, form)).toMatchObject({ ok: true });
    const saved = await db.prisma.transaction.findFirstOrThrow();
    expect(saved.userId).toBe(alice);
    expect(saved.source).toBe("WEB");
    form.set("amount", "1.234");
    expect(await mutateFinance({ message: "", ok: false }, form)).toMatchObject({ ok: false });
    context.requestHeaders = new Headers();
    expect(await mutateFinance({ message: "", ok: false }, form)).toMatchObject({ ok: false });
    expect(await db.prisma.transaction.count()).toBe(1);
  });
});
