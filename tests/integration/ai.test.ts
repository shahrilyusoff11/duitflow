import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { fixtureSessionCookie } from "../helpers/session-cookie";
import { createAuth, type DuitFlowAuth } from "../../src/lib/auth/create-auth";
import type { PrismaClient } from "../../src/generated/prisma/client";

const context = vi.hoisted(() => ({ requestHeaders: new Headers(), auth: undefined as DuitFlowAuth | undefined, database: undefined as PrismaClient | undefined, parse: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => context.requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => context.auth }));
vi.mock("@/lib/db", () => ({ getDatabase: () => context.database }));
vi.mock("@/lib/ai/provider", () => ({ deepseekProvider: () => ({ parse: context.parse }) }));
vi.mock("@/lib/telegram/transport", () => ({ sendMessage: vi.fn(async () => undefined), answerCallbackQuery: vi.fn(async () => undefined), TelegramTransportError: class extends Error { retryable = true; } }));

import * as telegram from "../../src/lib/telegram/dal";
import { getAiSettings, setAiConsent } from "../../src/lib/ai/dal";
import { mutateAiConsent } from "../../src/app/(protected)/settings/actions";
import { POST } from "../../src/app/api/telegram/webhook/route";
import { sendMessage } from "../../src/lib/telegram/transport";
import { DEEPSEEK_MODEL } from "../../src/lib/config/ai";
import { goldenCases } from "../fixtures/ai-golden";

const environment = {
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "synthetic-ai-secret-at-least-32-characters",
  GITHUB_CLIENT_ID: "synthetic-client", GITHUB_CLIENT_SECRET: "synthetic-secret",
  TELEGRAM_BOT_TOKEN: "123456:synthetic-telegram-token-longer-than-twenty",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-telegram-webhook-secret-longer-than32", TELEGRAM_BOT_USERNAME: "DuitFlowTestBot",
  AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "synthetic-not-a-live-api-key", DEEPSEEK_MODEL,
  AI_DAILY_LIMIT_PER_USER: "30", AI_MINUTE_LIMIT_PER_USER: "2",
};
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let alice: string, bob: string, food: string, transport: string, salary: string;
const sender = "123456789", bobSender = "987654321";
const now = new Date("2026-10-31T16:30:00Z");
async function signIn(userId: string) {
  const session = await db.prisma.session.create({ data: { userId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  context.requestHeaders = new Headers({ cookie: fixtureSessionCookie(session.token, environment.BETTER_AUTH_SECRET) });
}
async function connect(userId = alice, identity = sender) {
  await db.prisma.telegramConnection.create({ data: { userId, telegramUserId: identity } });
}
function consentForm(operation = "enable", consent = true) {
  const form = new FormData(); form.set("operation", operation); if (consent) form.set("consent", "deepseek"); return form;
}
const message = (id: number, text: string, identity = sender, type = "private") => ({ update_id: id, message: { message_id: id, from: { id: Number(identity), is_bot: false }, chat: { id: Number(identity), type }, text } });
const callback = (id: number, actionId: string) => ({ update_id: id, callback_query: { id: `callback-${id}`, from: { id: Number(sender), is_bot: false }, message: { message_id: 1, chat: { id: Number(sender), type: "private" } }, data: `a:${actionId}` } });
const deliver = (body: unknown) => POST(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": environment.TELEGRAM_WEBHOOK_SECRET }, body: JSON.stringify(body) }));
beforeAll(async () => {
  db = await createTestDatabase();
  Object.entries(environment).forEach(([key, value]) => vi.stubEnv(key, value));
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "DIRECT_URL"]) vi.stubEnv(key, db.connectionString);
  context.database = db.prisma; context.auth = createAuth(db.prisma, environment);
});
beforeEach(async () => {
  await db.prisma.$executeRaw`TRUNCATE "User" CASCADE`;
  await db.prisma.telegramUpdate.deleteMany(); await db.prisma.rateLimitEvent.deleteMany();
  alice = (await db.prisma.user.create({ data: { name: "Synthetic Alice", email: "alice@example.test" } })).id;
  bob = (await db.prisma.user.create({ data: { name: "Synthetic Bob", email: "bob@example.test" } })).id;
  food = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Makanan & Minuman" } })).id;
  transport = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Pengangkutan" } })).id;
  salary = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Gaji" } })).id;
  await signIn(alice); vi.clearAllMocks(); context.parse.mockReset();
  vi.stubEnv("DEEPSEEK_API_KEY", environment.DEEPSEEK_API_KEY);
});
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });

describe("AI consent and authorization with real persisted browser sessions", () => {
  it("defaults off, requires explicit consent and derives the owner from the session", async () => {
    expect(await getAiSettings(alice)).toEqual({ deepseekParsingEnabled: false, isDemo: false });
    expect((await mutateAiConsent({ ok: false, message: "" }, consentForm("enable", false))).ok).toBe(false);
    const oldForm = consentForm(); oldForm.set("consent", "yes");
    expect((await mutateAiConsent({ ok: false, message: "" }, oldForm)).ok).toBe(false);
    const form = consentForm(); form.set("userId", bob);
    expect((await mutateAiConsent({ ok: false, message: "" }, form)).ok).toBe(true);
    expect((await getAiSettings(alice)).deepseekParsingEnabled).toBe(true);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: bob } })).deepseekParsingEnabled).toBe(false);
    expect((await mutateAiConsent({ ok: false, message: "" }, consentForm("disable", false))).ok).toBe(true);
    expect((await getAiSettings(alice)).deepseekParsingEnabled).toBe(false);
  });
  it("denies foreign IDs, missing IDs, revoked sessions and demo mutation", async () => {
    await expect(getAiSettings(bob)).rejects.toThrow("FORBIDDEN");
    await expect(setAiConsent(bob, true)).rejects.toThrow("FORBIDDEN");
    await expect(getAiSettings("")).rejects.toThrow();
    await db.prisma.user.update({ where: { id: alice }, data: { isDemo: true } });
    await expect(setAiConsent(alice, true)).rejects.toThrow("FORBIDDEN");
    await db.prisma.session.deleteMany({ where: { userId: alice } });
    await expect(getAiSettings(alice)).rejects.toThrow("UNAUTHENTICATED");
    expect((await mutateAiConsent({ ok: false, message: "" }, consentForm())).ok).toBe(false);
  });
});

describe("webhook -> mocked AI -> scoped approval -> real Prisma/PostgreSQL", () => {
  it("uses deterministic intake with only legacy Gemini consent, with no API or quota event", async () => {
    await db.prisma.user.update({ where: { id: alice }, data: { aiParsingEnabled: true } });
    await connect();
    expect((await deliver(message(100, "Makan RM12"))).status).toBe(200);
    expect(context.parse).not.toHaveBeenCalled();
    expect(await db.prisma.rateLimitEvent.count()).toBe(0);
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("PROPOSAL");
    expect(await db.prisma.transaction.count()).toBe(0);
  });
  it("creates a multi-row proposal, saves only on explicit approval, and reuses retries", async () => {
    await connect(); await setAiConsent(alice, true);
    const fixture = goldenCases.find((item) => item.name === "Mixed income and expense")!;
    context.parse.mockResolvedValue(JSON.stringify(fixture.output));
    expect((await deliver(message(200, fixture.message))).status).toBe(200);
    const pending = await telegram.getPendingAction(alice, sender);
    expect(pending?.kind).toBe("PROPOSAL");
    expect(await db.prisma.transaction.count()).toBe(0);
    const payload = context.parse.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["categoryNames", "message", "today"]);
    expect(JSON.stringify(payload)).not.toContain(alice); expect(JSON.stringify(payload)).not.toContain(sender);
    expect((await deliver(message(201, "ya"))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await deliver(callback(202, pending!.id))).status).toBe(200);
    expect((await deliver(callback(203, pending!.id))).status).toBe(200);
    const rows = await db.prisma.transaction.findMany({ where: { userId: alice }, orderBy: { amount: "asc" } });
    expect(rows.map((row) => [row.amount.toFixed(2), row.type, row.source])).toEqual([["15.00", "EXPENSE", "TELEGRAM"], ["2500.00", "INCOME", "TELEGRAM"]]);
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Disimpan:"), undefined);
    expect((await deliver(message(200, fixture.message))).status).toBe(200);
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(1);
    expect(await db.prisma.transaction.count({ where: { userId: bob } })).toBe(0);
  });
  it("withdrawal and missing credentials prevent future API calls", async () => {
    await connect(); await setAiConsent(alice, true);
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    await deliver(message(300, "Makan RM12"));
    vi.stubEnv("DEEPSEEK_API_KEY", environment.DEEPSEEK_API_KEY);
    await setAiConsent(alice, false);
    await deliver(message(301, "Makan RM14"));
    expect(context.parse).not.toHaveBeenCalled(); expect(await db.prisma.rateLimitEvent.count()).toBe(0);
  });
  it("falls back on a provider failure and never stores bad AI output", async () => {
    await connect(); await setAiConsent(alice, true);
    context.parse.mockRejectedValueOnce(new Error("synthetic-sensitive-error"));
    expect((await deliver(message(400, "Makan RM12"))).status).toBe(200);
    context.parse.mockResolvedValueOnce(JSON.stringify({ intent: "save_now", userId: bob, amount: "9999" }));
    expect((await deliver(message(401, "Tell me something?"))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(1);
    expect(JSON.stringify(vi.mocked(sendMessage).mock.calls)).not.toContain("synthetic-sensitive-error");
  });
  it("does not dispatch to AI for unlinked or group senders", async () => {
    await setAiConsent(alice, true);
    await deliver(message(500, "Lunch RM12"));
    await connect(); await deliver(message(501, "Lunch RM12", sender, "group"));
    expect(context.parse).not.toHaveBeenCalled();
    await expect(telegram.consumeTelegramAiAttempt(bob, sender, 2, 30)).rejects.toThrow("TELEGRAM_NOT_LINKED");
  });
  it("rechecks the live connection before persisting a proposal after an in-flight parse", async () => {
    await connect(); await setAiConsent(alice, true);
    context.parse.mockImplementation(async () => {
      await telegram.unlinkTelegram(alice);
      return JSON.stringify(goldenCases[0].output);
    });
    expect((await deliver(message(600, goldenCases[0].message))).status).toBe(200);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(0);
    expect(await db.prisma.transaction.count()).toBe(0);
  });
  it("routes a natural query through fixed DB operations and never sends DB results back to the model", async () => {
    await connect(); await setAiConsent(alice, true);
    await db.prisma.transaction.create({ data: { userId: alice, categoryId: food, type: "EXPENSE", amount: "12.50", description: "Synthetic", occurredOn: new Date("2026-11-01Z"), source: "WEB" } });
    context.parse.mockResolvedValue(JSON.stringify({ intent: "query", transactions: [], requiresConfirmation: false, uncertainty: [], query: { operation: "spend_by_category", period: "2026-11", categoryName: "makan" } }));
    expect((await deliver(message(700, "Berapa belanja makan 2026-11?"))).status).toBe(200);
    expect(sendMessage).toHaveBeenLastCalledWith(sender, "2026-11 · Makanan & Minuman: RM 12.50", undefined);
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(0);
  });
});

describe("atomic shared Postgres AI limits", () => {
  it("serializes concurrent per-user attempts, counts failures and releases only expired windows", async () => {
    await connect(); await setAiConsent(alice, true);
    const result = await Promise.all(Array.from({ length: 4 }, () => telegram.consumeTelegramAiAttempt(alice, sender, 2, 30)));
    expect(result.filter(Boolean)).toHaveLength(2);
    expect(await db.prisma.rateLimitEvent.count()).toBe(4); // one user + one project event per attempt
    await db.prisma.rateLimitEvent.updateMany({ data: { createdAt: new Date(Date.now() - 61_000) } });
    expect(await telegram.consumeTelegramAiAttempt(alice, sender, 2, 2)).toBe(false); // rolling day
    await db.prisma.rateLimitEvent.updateMany({ data: { createdAt: new Date(Date.now() - 86_401_000) } });
    expect(await telegram.consumeTelegramAiAttempt(alice, sender, 2, 2)).toBe(true);
  });
  it("caps the entire project across users and fails closed on exhausted day quota", async () => {
    await connect(); await connect(bob, bobSender); await setAiConsent(alice, true); await signIn(bob); await setAiConsent(bob, true);
    await telegram.consumeTelegramAiAttempt(alice, sender, 2, 30); await telegram.consumeTelegramAiAttempt(alice, sender, 2, 30);
    await telegram.consumeTelegramAiAttempt(bob, bobSender, 2, 30); await telegram.consumeTelegramAiAttempt(bob, bobSender, 2, 30);
    // Only the user event timestamps move, leaving the project window full.
    const projectKey = createHash("sha256").update("ai-project:deepseek").digest("hex");
    await db.prisma.rateLimitEvent.updateMany({ where: { key: { not: projectKey } }, data: { createdAt: new Date(Date.now() - 61_000) } });
    expect(await telegram.consumeTelegramAiAttempt(alice, sender, 2, 30)).toBe(false);
    await db.prisma.rateLimitEvent.deleteMany();
    await db.prisma.rateLimitEvent.createMany({ data: Array.from({ length: 30 }, () => ({ key: projectKey, bucket: "ai:parse", createdAt: new Date(Date.now() - 61_000) })) });
    expect(await telegram.consumeTelegramAiAttempt(alice, sender, 2, 30)).toBe(false);
  });
});

describe("five fixed financial query operations", () => {
  beforeEach(async () => {
    await connect();
    const foreign = await db.prisma.category.findFirstOrThrow({ where: { userId: bob, transactionType: "EXPENSE" } });
    await db.prisma.transaction.createMany({ data: [
      { userId: alice, categoryId: salary, type: "INCOME", amount: "1000", occurredOn: new Date("2026-11-01Z"), description: "Synthetic income", source: "WEB" },
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "12.50", occurredOn: new Date("2026-11-01Z"), description: "Synthetic food", source: "WEB" },
      { userId: alice, categoryId: transport, type: "EXPENSE", amount: "60", occurredOn: new Date("2026-11-01Z"), description: "Synthetic travel", source: "WEB" },
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "7.20", occurredOn: new Date("2026-10-31Z"), description: "Synthetic October", source: "WEB" },
      { userId: bob, categoryId: foreign.id, type: "EXPENSE", amount: "9999.99", occurredOn: new Date("2026-11-01Z"), description: "Foreign record", source: "WEB" },
    ] });
    await db.prisma.budget.create({ data: { userId: alice, categoryId: food, year: 2026, month: 11, limitAmount: "100" } });
  });
  it("returns exact owner totals and Malaysian current/previous month boundaries", async () => {
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "net_for_period", period: "this_month" }, now)).toEqual({ kind: "NET", month: "2026-11", income: "1000.00", expense: "72.50", net: "927.50" });
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "net_for_period", period: "last_month" }, now)).toMatchObject({ income: "0.00", expense: "7.20", net: "-7.20", month: "2026-10" });
  });
  it("matches category names on the server and asks on an unknown/foreign category", async () => {
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "spend_by_category", period: "this_month", categoryName: "makan" }, now)).toMatchObject({ categoryName: "Makanan & Minuman", amount: "12.50" });
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "spend_by_category", period: "this_month", categoryName: "Nonexistent" }, now)).toEqual({ kind: "UNKNOWN_CATEGORY" });
  });
  it("returns ranked categories, budget remaining/percent and bounded recent rows", async () => {
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "top_categories", period: "this_month", limit: 1 }, now)).toEqual({ kind: "TOP", month: "2026-11", rows: [{ categoryName: "Pengangkutan", amount: "60.00" }] });
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "budget_status", period: "this_month", categoryName: "makan" }, now)).toEqual({ kind: "BUDGET", month: "2026-11", rows: [{ categoryName: "Makanan & Minuman", spent: "12.50", limit: "100.00", remaining: "87.50", percent: "12.50" }] });
    const recent = await telegram.queryTelegramFinance(alice, sender, { operation: "recent_transactions", limit: 2 }, now);
    expect(recent.kind).toBe("RECENT"); if (recent.kind === "RECENT") { expect(recent.rows).toHaveLength(2); expect(JSON.stringify(recent)).not.toContain("Foreign"); }
  });
  it("rejects unknown operations, extra user IDs, bad ranges and disconnected/foreign senders", async () => {
    for (const input of [{ operation: "sql", sql: "SELECT" }, { operation: "recent_transactions", limit: 11 }, { operation: "net_for_period", period: "2026-13" }, { operation: "recent_transactions", limit: 1, userId: bob }]) await expect(telegram.queryTelegramFinance(alice, sender, input)).rejects.toThrow();
    await expect(telegram.queryTelegramFinance(bob, sender, { operation: "recent_transactions", limit: 1 })).rejects.toThrow("TELEGRAM_NOT_LINKED");
    await telegram.unlinkTelegram(alice);
    await expect(telegram.queryTelegramFinance(alice, sender, { operation: "recent_transactions", limit: 1 })).rejects.toThrow("TELEGRAM_NOT_LINKED");
  });
});
