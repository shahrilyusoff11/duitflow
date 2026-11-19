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
import { monthRange, parseDate, shiftMonth, todayInMalaysia } from "../../src/lib/finance/dates";

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
  const form = new FormData(); form.set("operation", operation); if (consent) form.set("consent", "deepseek-chat"); return form;
}
const message = (id: number, text: string, identity = sender, type = "private") => ({ update_id: id, message: { message_id: id, from: { id: Number(identity), is_bot: false }, chat: { id: Number(identity), type }, text } });
const callback = (id: number, actionId: string, identity = sender) => ({ update_id: id, callback_query: { id: `callback-${id}`, from: { id: Number(identity), is_bot: false }, message: { message_id: 1, chat: { id: Number(identity), type: "private" } }, data: `a:${actionId}` } });
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
    expect(await getAiSettings(alice)).toEqual({ deepseekChatEnabled: false, isDemo: false });
    expect((await mutateAiConsent({ ok: false, message: "" }, consentForm("enable", false))).ok).toBe(false);
    const oldForm = consentForm(); oldForm.set("consent", "deepseek");
    expect((await mutateAiConsent({ ok: false, message: "" }, oldForm)).ok).toBe(false);
    const form = consentForm(); form.set("userId", bob);
    expect((await mutateAiConsent({ ok: false, message: "" }, form)).ok).toBe(true);
    expect((await getAiSettings(alice)).deepseekChatEnabled).toBe(true);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: bob } })).deepseekChatEnabled).toBe(false);
    expect((await mutateAiConsent({ ok: false, message: "" }, consentForm("disable", false))).ok).toBe(true);
    expect((await getAiSettings(alice)).deepseekChatEnabled).toBe(false);
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
  it("uses deterministic intake with only legacy consent, with no API or quota event", async () => {
    await db.prisma.user.update({ where: { id: alice }, data: { aiParsingEnabled: true, deepseekParsingEnabled: true } });
    await connect();
    expect((await deliver(message(99, "Duit aku bocor kat mana bulan ni?"))).status).toBe(200);
    expect((await deliver(message(100, "Makan RM12"))).status).toBe(200);
    expect(context.parse).not.toHaveBeenCalled();
    expect(await db.prisma.rateLimitEvent.count({ where: { bucket: "ai:parse" } })).toBe(0);
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("PROPOSAL");
    expect(await db.prisma.transaction.count()).toBe(0);
  });
  it("creates a multi-row proposal, saves only on explicit approval, and reuses retries", async () => {
    await connect(); await setAiConsent(alice, true);
    const fixture = goldenCases.find((item) => item.name === "Mixed income and expense")!;
    const text = "Gaji credited RM2500 from Testname kemudian paid RM15 for brunch";
    context.parse.mockResolvedValue(JSON.stringify(fixture.output));
    expect((await deliver(message(200, text))).status).toBe(200);
    const pending = await telegram.getPendingAction(alice, sender);
    expect(pending?.kind).toBe("PROPOSAL");
    expect(await db.prisma.transaction.count()).toBe(0);
    const payload = context.parse.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["categoryNames", "message"]);
    expect(JSON.stringify(payload)).not.toContain(alice); expect(JSON.stringify(payload)).not.toContain(sender);
    expect(payload.message).not.toMatch(/Testname|2500|RM15/);
    expect((await deliver(message(201, "ya"))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await deliver(callback(202, pending!.id))).status).toBe(200);
    expect((await deliver(callback(203, pending!.id))).status).toBe(200);
    const rows = await db.prisma.transaction.findMany({ where: { userId: alice }, orderBy: { amount: "asc" } });
    expect(rows.map((row) => [row.amount.toFixed(2), row.type, row.source])).toEqual([["15.00", "EXPENSE", "TELEGRAM"], ["2500.00", "INCOME", "TELEGRAM"]]);
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Disimpan:"), undefined);
    expect((await deliver(message(200, text))).status).toBe(200);
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(1);
    expect(await db.prisma.transaction.count({ where: { userId: bob } })).toBe(0);
  });
  it("withdrawal and missing credentials prevent future API calls", async () => {
    await connect(); await setAiConsent(alice, true);
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    await deliver(message(300, "Paid RM12 for brunch"));
    vi.stubEnv("DEEPSEEK_API_KEY", environment.DEEPSEEK_API_KEY);
    await setAiConsent(alice, false);
    await deliver(message(301, "Paid RM14 for brunch"));
    expect(context.parse).not.toHaveBeenCalled();
    expect(await db.prisma.rateLimitEvent.count({ where: { bucket: "ai:parse" } })).toBe(0);
  });
  it("falls back on a provider failure and never stores bad AI output", async () => {
    await connect(); await setAiConsent(alice, true);
    context.parse.mockRejectedValueOnce(new Error("synthetic-sensitive-error"));
    expect((await deliver(message(400, "Buku RM12"))).status).toBe(200);
    context.parse.mockResolvedValueOnce(JSON.stringify({ intent: "save_now", userId: bob, amount: "9999" }));
    expect((await deliver(message(401, "Paid RM12 for brunch"))).status).toBe(200);
    expect(context.parse).toHaveBeenCalledTimes(2);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect(await db.prisma.pendingTelegramAction.count({ where: { consumedAt: null, kind: "CLARIFICATION" } })).toBe(1);
    expect(JSON.stringify(vi.mocked(sendMessage).mock.calls)).not.toContain("synthetic-sensitive-error");
  });
  it("does not dispatch to AI for unlinked or group senders", async () => {
    await setAiConsent(alice, true);
    await deliver(message(500, "Brunch RM12"));
    await connect(); await deliver(message(501, "Brunch RM12", sender, "group"));
    expect(context.parse).not.toHaveBeenCalled();
    await expect(telegram.consumeTelegramAiAttempt(bob, sender, 2, 30)).rejects.toThrow("TELEGRAM_NOT_LINKED");
  });
  it("rechecks the live connection before persisting a proposal after an in-flight parse", async () => {
    await connect(); await setAiConsent(alice, true);
    context.parse.mockImplementation(async () => {
      await telegram.unlinkTelegram(alice);
      return JSON.stringify(goldenCases[0].output);
    });
    expect((await deliver(message(600, "Paid RM12 for brunch"))).status).toBe(200);
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(await db.prisma.pendingTelegramAction.count()).toBe(0);
    expect(await db.prisma.transaction.count()).toBe(0);
  });
  it("routes a natural query through fixed DB operations and never sends DB results back to the model", async () => {
    await connect(); await setAiConsent(alice, true);
    await db.prisma.transaction.create({ data: { userId: alice, categoryId: food, type: "EXPENSE", amount: "12.50", description: "Synthetic", occurredOn: new Date("2026-11-01Z"), source: "WEB" } });
    expect((await deliver(message(700, "Berapa belanja makan 2026-11?"))).status).toBe(200);
    expect(sendMessage).toHaveBeenLastCalledWith(sender, "2026-11 · Makanan & Minuman: RM 12.50", undefined);
    expect(context.parse).not.toHaveBeenCalled();
    expect(await db.prisma.pendingTelegramAction.count()).toBe(0);
  });
  it("continues a private financial discussion without saving a hypothetical purchase", async () => {
    await connect(); await connect(bob, bobSender); await setAiConsent(alice, true);
    const current = todayInMalaysia().slice(0, 7);
    const previous = shiftMonth(current, -1);
    const { start } = monthRange(current);
    await db.prisma.transaction.createMany({ data: [
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "35", occurredOn: start, description: "Synthetic current", source: "WEB" },
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "23", occurredOn: monthRange(previous).start, description: "Synthetic prior", source: "WEB" },
    ] });
    await db.prisma.budget.create({ data: { userId: alice, categoryId: food, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, limitAmount: "100" } });

    await deliver(message(710, "Makan RM12"));
    const original = await telegram.getPendingAction(alice, sender);
    expect(original?.kind).toBe("PROPOSAL");
    expect((await deliver(message(711, "Macam mana kewangan aku bulan ni?"))).status).toBe(200);
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Belanja naik RM 12.00"), undefined);
    await deliver(message(712, "Kalau bulan lepas pula?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining(`Ringkasan kewangan · ${previous}`), undefined);
    await deliver(message(713, "Ada cadangan?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining(`Ruang untuk berjimat · ${previous}`), undefined);
    await deliver(message(714, "Apa cadangan untuk berbelanja?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Untuk berjimat, mula dengan semak belian Makanan & Minuman"), undefined);
    await deliver(message(715, "Trend belanja tiga bulan"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining(`${current} (setakat hari ini) · RM 35.00`), undefined);
    await deliver(message(716, "Boleh spend RM100 untuk makan?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("bajet akan terlebih RM 35.00"), undefined);
    await deliver(message(717, "Kalau RM50 pula?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("baki bajet jadi RM 15.00"), undefined);
    const connection = await db.prisma.telegramConnection.findUniqueOrThrow({ where: { userId: alice } });
    expect(connection.financeTopic).toEqual({
      updateId: 717, query: { operation: "purchase_check", period: current, categoryName: "Makanan & Minuman" },
    });
    expect(await db.prisma.transaction.count()).toBe(2);
    expect((await telegram.getPendingAction(alice, sender))?.id).toBe(original?.id);
    expect(context.parse).not.toHaveBeenCalled();

    await deliver(message(718, "Kalau RM50 pula?", bobSender));
    expect(sendMessage).toHaveBeenLastCalledWith(bobSender, expect.stringContaining("Sebut soalan penuh"), undefined);
    await db.prisma.telegramConnection.update({ where: { userId: alice }, data: { financeTopicExpiresAt: new Date(Date.now() - 1_000) } });
    await deliver(message(719, "Kalau RM50 pula?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Sebut soalan penuh"), undefined);
    await deliver(message(720, "Analisis kewangan aku bulan ni"));
    await deliver(message(721, "/cancel"));
    await telegram.setTelegramFinanceTopic(alice, sender, connection.id, 720, { operation: "analyze_for_period", period: current, focus: "OVERVIEW" });
    expect(await telegram.getTelegramFinanceTopic(alice, sender, connection.id, 722)).toBeNull();
  });
});

describe("conversational routing with mocked DeepSeek and disposable PostgreSQL", () => {
  it("routes both spending questions to the same scoped query and changes month from chat context", async () => {
    await connect(); await connect(bob, bobSender); await setAiConsent(alice, true);
    const current = todayInMalaysia().slice(0, 7);
    const previous = shiftMonth(current, -1);
    const bobFood = await db.prisma.category.findFirstOrThrow({ where: { userId: bob, name: "Makanan & Minuman" } });
    await db.prisma.transaction.createMany({ data: [
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "13.27", occurredOn: monthRange(current).start, description: "Synthetic current" },
      { userId: alice, categoryId: transport, type: "EXPENSE", amount: "8.19", occurredOn: monthRange(previous).start, description: "Synthetic prior" },
      { userId: bob, categoryId: bobFood.id, type: "EXPENSE", amount: "9999.99", occurredOn: monthRange(current).start, description: "Synthetic foreign" },
    ] });
    context.parse.mockResolvedValueOnce(JSON.stringify({ intent: "finance_query", query: { operation: "top_categories", period: "[MONTH_1]" } }))
      .mockResolvedValueOnce(JSON.stringify({ intent: "finance_query", query: { operation: "top_categories" } }));

    expect((await deliver(message(800, "Weh, kat mana duit aku lari bulan ni?"))).status).toBe(200);
    const currentAnswer = vi.mocked(sendMessage).mock.lastCall?.[1];
    expect(currentAnswer).toContain(current);
    expect(currentAnswer).toContain("Makanan & Minuman: RM 13.27");
    expect((await deliver(message(801, "Which kategori makan paling banyak duit aku?"))).status).toBe(200);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toBe(currentAnswer);

    // Age the AI windows only. This keeps the real ten-minute topic active.
    await db.prisma.rateLimitEvent.updateMany({ where: { bucket: "ai:parse" }, data: { createdAt: new Date(Date.now() - 61_000) } });
    context.parse.mockResolvedValueOnce(JSON.stringify({ intent: "follow_up", kind: "PERIOD", value: "[MONTH_1]" }));
    expect((await deliver(message(802, "What about for the previous month then?"))).status).toBe(200);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain(previous);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("Pengangkutan: RM 8.19");
    await deliver(message(803, "kalau bulan lepas?", bobSender));
    expect(sendMessage).toHaveBeenLastCalledWith(bobSender, expect.stringContaining("Sebut soalan penuh"), undefined);
    expect(await db.prisma.transaction.count()).toBe(3);
    expect(context.parse.mock.calls.map(([payload]) => payload.message)).toEqual([
      "Weh, kat mana duit aku lari [MONTH_1]?", "Which kategori makan paling banyak duit aku?", "What about for the [MONTH_1] then?",
    ]);
    expect(JSON.stringify(context.parse.mock.calls)).not.toMatch(/Synthetic|13\.27|8\.19|9999\.99|123456789/);
    expect(JSON.stringify(vi.mocked(sendMessage).mock.calls)).not.toContain("9,999.99");
  });

  it("matches masked categories inside the owner's records and keeps foreign names out of the response", async () => {
    await connect(); await setAiConsent(alice, true);
    const mine = await db.prisma.category.create({ data: { userId: alice, name: "Private Review", transactionType: "EXPENSE" } });
    await db.prisma.category.create({ data: { userId: bob, name: "Foreign Label", transactionType: "EXPENSE" } });
    await db.prisma.transaction.create({ data: { userId: alice, categoryId: mine.id, type: "EXPENSE", amount: "65.11", occurredOn: parseDate(todayInMalaysia()), description: "Synthetic expense" } });
    context.parse.mockResolvedValue(JSON.stringify({ intent: "finance_query", query: { operation: "spend_by_category", categoryName: "[NAME_1]" } }));

    await deliver(message(810, "How much cash went to Private Review?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Private Review: RM 65.11"), undefined);
    await deliver(message(811, "How much cash went to Foreign Label?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Kategori tidak jelas"), undefined);
    expect(context.parse.mock.calls.map(([payload]) => payload.message)).toEqual([
      "How much cash went to [NAME_1]?", "How much cash went to [NAME_1]?",
    ]);
  });

  it("resolves a contextual payment, requires a private approval and rejects a stale bill before a fresh replay-safe approval", async () => {
    await connect(); await connect(bob, bobSender); await setAiConsent(alice, true);
    const due = parseDate(todayInMalaysia());
    const mine = await db.prisma.recurringBill.create({ data: {
      userId: alice, categoryId: food, name: "Synthetic private bill", amount: "42.37", cadence: "MONTHLY",
      nextDueOn: due, dayOfMonth: due.getUTCDate(),
    } });
    context.parse.mockResolvedValue(JSON.stringify({ intent: "pay_bill", target: "context", requiresConfirmation: true }));
    await deliver(message(820, "/bills"));
    expect(context.parse).not.toHaveBeenCalled();
    await deliver(message(821, "I already cleared that bill."));
    const stale = await telegram.getPendingAction(alice, sender);
    expect(stale).toMatchObject({ kind: "PROPOSAL", payload: { billId: mine.id, version: 0, payment: { amount: "42.37", occurredOn: todayInMalaysia() } } });
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("RM 42.37");
    await deliver(message(822, "sahkan"));
    await deliver(callback(823, stale!.id, bobSender));
    expect(await db.prisma.transaction.count()).toBe(0);
    await db.prisma.recurringBill.update({ where: { id: mine.id }, data: { version: { increment: 1 }, amount: "44.53" } });
    await deliver(callback(824, stale!.id));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Butiran bil sudah berubah"), undefined);
    expect(await db.prisma.transaction.count()).toBe(0);

    await deliver(message(825, "/bills"));
    const second = message(826, "I've settled that bill already.");
    await deliver(second);
    const fresh = await telegram.getPendingAction(alice, sender);
    expect(fresh).toMatchObject({ kind: "PROPOSAL", payload: { billId: mine.id, version: 1, payment: { amount: "44.53" } } });
    const approval = callback(827, fresh!.id);
    await deliver(approval); await deliver(approval); await deliver(callback(828, fresh!.id)); await deliver(second);
    const rows = await db.prisma.transaction.findMany();
    expect(rows.map((row) => [row.userId, row.billId, row.amount.toFixed(2)])).toEqual([[alice, mine.id, "44.53"]]);
    expect(context.parse.mock.calls.map(([payload]) => payload.message)).toEqual(["I already cleared that bill.", "I've settled that bill already."]);
  });

  it("asks which bill when the reference matches multiple bills, and keeps the choice local", async () => {
    await connect(); await setAiConsent(alice, true);
    const due = parseDate(todayInMalaysia());
    await db.prisma.recurringBill.createMany({ data: ["Synthetic A", "Synthetic B"].map((name, index) => ({
      id: "synthetic-bill-" + index, name, userId: alice, categoryId: food, amount: "31.00",
      cadence: "MONTHLY" as const, nextDueOn: due, dayOfMonth: due.getUTCDate(),
    })) });
    context.parse.mockResolvedValue(JSON.stringify({ intent: "pay_bill", target: "context", requiresConfirmation: true }));
    await deliver(message(830, "/bills"));
    await deliver(message(831, "I've already settled that bill."));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bil mana yang dah dibayar?"), undefined);
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("CLARIFICATION");
    await deliver(message(832, "yang kedua"));
    expect(await telegram.getPendingAction(alice, sender)).toMatchObject({ kind: "PROPOSAL", payload: { billId: "synthetic-bill-1" } });
    expect(context.parse).toHaveBeenCalledTimes(1);
    expect(await db.prisma.transaction.count()).toBe(0);
  });

  it("does not recreate an in-flight AI proposal after the user cancels", async () => {
    await connect(); await setAiConsent(alice, true);
    context.parse.mockImplementation(async () => {
      expect((await deliver(message(841, "/cancel"))).status).toBe(200);
      return JSON.stringify({ intent: "add_transactions", transactions: [
        { sourceIndex: 1, type: "EXPENSE", categoryName: "Makanan & Minuman" },
      ], requiresConfirmation: true });
    });
    expect((await deliver(message(840, "Paid RM12 for brunch"))).status).toBe(200);
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    expect(await db.prisma.transaction.count()).toBe(0);
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

describe("owner-scoped financial queries", () => {
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
  it("compares the same Malaysian calendar days and reports configured budget warnings", async () => {
    await db.prisma.transaction.createMany({ data: [
      { userId: alice, categoryId: food, type: "EXPENSE", amount: "20", occurredOn: new Date("2026-10-01Z"), description: "Synthetic previous day", source: "WEB" },
      { userId: alice, categoryId: transport, type: "EXPENSE", amount: "150", occurredOn: new Date("2026-11-02Z"), description: "Synthetic future date", source: "WEB" },
    ] });
    await db.prisma.budget.create({ data: { userId: alice, categoryId: transport, year: 2026, month: 11, limitAmount: "75", warningAt: 80 } });
    const analysis = await telegram.queryTelegramFinance(alice, sender, { operation: "analyze_for_period", period: "this_month", focus: "OVERVIEW" }, now);
    expect(analysis).toMatchObject({
      kind: "ANALYSIS", month: "2026-11", monthToDate: true, income: "1000.00", expense: "72.50", net: "927.50",
      previousMonth: "2026-10", previousExpense: "20.00", change: "52.50",
      top: { name: "Pengangkutan", amount: "60.00" },
      warnings: [{ categoryName: "Pengangkutan", limit: "75.00", spent: "60.00", remaining: "15.00" }],
    });
    expect(await telegram.queryTelegramFinance(alice, sender, { operation: "spending_trend", months: 3, period: "this_month" }, now)).toMatchObject({
      kind: "TREND", rows: [
        { month: "2026-09", amount: "0.00", partial: false },
        { month: "2026-10", amount: "27.20", partial: false },
        { month: "2026-11", amount: "72.50", partial: true },
      ],
    });
  });
  it("rejects unknown operations, extra user IDs, bad ranges and disconnected/foreign senders", async () => {
    for (const input of [{ operation: "sql", sql: "SELECT" }, { operation: "recent_transactions", limit: 11 }, { operation: "net_for_period", period: "2026-13" }, { operation: "recent_transactions", limit: 1, userId: bob }]) await expect(telegram.queryTelegramFinance(alice, sender, input)).rejects.toThrow();
    await expect(telegram.queryTelegramFinance(bob, sender, { operation: "recent_transactions", limit: 1 })).rejects.toThrow("TELEGRAM_NOT_LINKED");
    await telegram.unlinkTelegram(alice);
    await expect(telegram.queryTelegramFinance(alice, sender, { operation: "recent_transactions", limit: 1 })).rejects.toThrow("TELEGRAM_NOT_LINKED");
  });
});
