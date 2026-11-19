import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { fixtureSessionCookie } from "../helpers/session-cookie";
import { createAuth, type DuitFlowAuth } from "../../src/lib/auth/create-auth";
import type { PrismaClient } from "../../src/generated/prisma/client";

const context = vi.hoisted(() => ({ requestHeaders: new Headers(), auth: undefined as DuitFlowAuth | undefined, database: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => context.requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => context.auth }));
vi.mock("@/lib/db", () => ({ getDatabase: () => context.database }));
vi.mock("@/lib/telegram/transport", () => ({ sendMessage: vi.fn(async () => undefined), answerCallbackQuery: vi.fn(async () => undefined), TelegramTransportError: class extends Error { constructor(public retryable: boolean) { super("TELEGRAM_DELIVERY_FAILED"); } } }));

import * as telegram from "../../src/lib/telegram/dal";
import { sendMessage, answerCallbackQuery, TelegramTransportError } from "../../src/lib/telegram/transport";
import { POST } from "../../src/app/api/telegram/webhook/route";
import { mutateTelegram } from "../../src/app/(protected)/settings/actions";
import * as updateState from "../../src/lib/telegram/state";
import { parseDate, todayInMalaysia } from "../../src/lib/finance/dates";

const environment = {
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "synthetic-telegram-secret-at-least-32-characters",
  GITHUB_CLIENT_ID: "synthetic-client", GITHUB_CLIENT_SECRET: "synthetic-secret",
  TELEGRAM_BOT_TOKEN: "123456:synthetic-telegram-token-longer-than-twenty",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-telegram-webhook-secret-longer-than32", TELEGRAM_BOT_USERNAME: "DuitFlowTestBot",
};
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let alice: string, bob: string, food: string, income: string, foreignCategory: string;
const sender = "123456789";
const foreignSender = "987654321";
async function signIn(userId: string) {
  const session = await db.prisma.session.create({ data: { userId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
  context.requestHeaders = new Headers({ cookie: fixtureSessionCookie(session.token, environment.BETTER_AUTH_SECRET) });
}
const proposal = (categoryId: string, amount = "12.50") => ({ transactions: [{ categoryId, amount, occurredOn: "2026-11-01", type: "EXPENSE", description: "Synthetic meal" }] });
async function connect() {
  const issued = await telegram.createLinkToken(alice);
  const challenge = await telegram.redeemLinkToken(issued.token, sender);
  if (typeof challenge === "string") throw new Error(challenge);
  expect(await telegram.confirmTelegramLink(alice, challenge.code)).toBe(true);
}

beforeAll(async () => {
  db = await createTestDatabase();
  Object.entries(environment).forEach(([key, value]) => vi.stubEnv(key, value));
  vi.stubEnv("AI_PROVIDER", "deterministic");
  vi.stubEnv("DATABASE_URL", db.connectionString);
  context.database = db.prisma;
  context.auth = createAuth(db.prisma, environment);
});
beforeEach(async () => {
  await db.prisma.$executeRaw`TRUNCATE "User" CASCADE`;
  await db.prisma.telegramUpdate.deleteMany();
  await db.prisma.rateLimitEvent.deleteMany();
  alice = (await db.prisma.user.create({ data: { name: "Alice", email: "alice@example.test" } })).id;
  bob = (await db.prisma.user.create({ data: { name: "Bob", email: "bob@example.test" } })).id;
  food = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Makanan & Minuman" } })).id;
  income = (await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Gaji" } })).id;
  foreignCategory = (await db.prisma.category.findFirstOrThrow({ where: { userId: bob, transactionType: "EXPENSE" } })).id;
  await signIn(alice);
  vi.clearAllMocks();
  vi.mocked(sendMessage).mockReset().mockResolvedValue(undefined);
  vi.mocked(answerCallbackQuery).mockReset().mockResolvedValue(undefined);
});

const messageUpdate = (updateId: number, text: string, identity = Number(sender), chatType = "private") => ({ update_id: updateId, message: { message_id: updateId + 1, from: { id: identity, is_bot: false }, chat: { id: identity, type: chatType }, text } });
const callbackUpdate = (updateId: number, id: string, identity = Number(sender), code = "a") => ({ update_id: updateId, callback_query: { id: `callback-${updateId}`, from: { id: identity, is_bot: false }, message: { message_id: 10, chat: { id: identity, type: "private" } }, data: `${code}:${id}` } });
const deliver = (body: unknown) => POST(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": environment.TELEGRAM_WEBHOOK_SECRET }, body: JSON.stringify(body) }));

describe("complete secret-authenticated webhook to Prisma flow", () => {
  it("links, clarifies an amount, rejects casual approval, saves once and handles redelivery", async () => {
    const issued = await telegram.createLinkToken(alice);
    expect((await deliver(messageUpdate(100, `/start ${issued.token}`))).status).toBe(200);
    expect(await telegram.resolveTelegramUser(sender)).toBeNull();
    const code = /Kod pengesahan DuitFlow: ([A-Za-z0-9_-]{16})/.exec(vi.mocked(sendMessage).mock.calls[0][1])?.[1];
    expect(await telegram.confirmTelegramLink(alice, code)).toBe(true);
    expect(await telegram.resolveTelegramUser(sender)).toMatchObject({ id: alice });
    expect((await deliver(messageUpdate(101, "Makan"))).status).toBe(200);
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("CLARIFICATION");
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await deliver(messageUpdate(102, "RM12"))).status).toBe(200);
    const pending = await telegram.getPendingAction(alice, sender);
    expect(pending?.kind).toBe("PROPOSAL");
    const markup = vi.mocked(sendMessage).mock.calls.findLast((call) => call[2])?.[2];
    expect(markup?.inline_keyboard[0][0].callback_data).toBe(`a:${pending!.id}`);
    expect((await deliver(messageUpdate(103, "ya"))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await deliver(callbackUpdate(104, pending!.id))).status).toBe(200);
    expect(await db.prisma.transaction.count({ where: { userId: alice, source: "TELEGRAM" } })).toBe(1);
    const sent = vi.mocked(sendMessage).mock.calls.length;
    expect((await deliver(callbackUpdate(104, pending!.id))).status).toBe(200);
    expect(vi.mocked(sendMessage).mock.calls.length).toBe(sent);
    expect((await deliver(callbackUpdate(105, pending!.id))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(1);
    expect(answerCallbackQuery).toHaveBeenCalledWith("callback-105", expect.any(String));
    expect(await db.prisma.telegramUpdate.findMany({ where: { status: "DONE" } })).toHaveLength(6);
  });

  it("retries a network timeout without losing the intake and keeps a committed approval idempotent", async () => {
    await connect();
    vi.mocked(sendMessage).mockRejectedValueOnce(new TelegramTransportError(true));
    expect((await deliver(messageUpdate(200, "Makan RM12"))).status).toBe(503);
    expect((await db.prisma.telegramUpdate.findUniqueOrThrow({ where: { telegramUpdateId: BigInt(200) } })).status).toBe("FAILED");
    expect((await deliver(messageUpdate(200, "Makan RM12"))).status).toBe(200);
    const pending = await telegram.getPendingAction(alice, sender);
    expect(pending?.kind).toBe("PROPOSAL");
    expect((await db.prisma.telegramUpdate.findUniqueOrThrow({ where: { telegramUpdateId: BigInt(200) } })).attempts).toBe(2);
    vi.mocked(sendMessage).mockRejectedValueOnce(new TelegramTransportError(true));
    expect((await deliver(callbackUpdate(201, pending!.id))).status).toBe(503);
    expect(await db.prisma.transaction.count()).toBe(1);
    expect((await deliver(callbackUpdate(201, pending!.id))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(1);
  });

  it("reuses the original message action after a completion failure even if approval already committed", async () => {
    await connect();
    vi.spyOn(updateState, "finishTelegramUpdate").mockRejectedValueOnce(new Error("SYNTHETIC_STATE_TIMEOUT"));
    expect((await deliver(messageUpdate(250, "Makan RM12"))).status).toBe(503);
    const original = await telegram.getActionForUpdate(alice, sender, 250);
    expect(original?.kind).toBe("PROPOSAL");
    expect((await deliver(callbackUpdate(251, original!.id))).status).toBe(200);
    expect(await db.prisma.transaction.count()).toBe(1);
    expect((await deliver(messageUpdate(250, "Makan RM12"))).status).toBe(200);
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    expect(await db.prisma.pendingTelegramAction.count({ where: { userId: alice } })).toBe(1);
    expect(await db.prisma.transaction.count()).toBe(1);
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("sudah diproses"), undefined);
    vi.restoreAllMocks();
  });

  it("does not disclose financial data to unlinked senders or groups and answers invalid callbacks", async () => {
    expect((await deliver(messageUpdate(300, "/balance"))).status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("belum disambungkan"), undefined);
    vi.mocked(sendMessage).mockClear();
    expect((await deliver(messageUpdate(301, "/report", Number(sender), "group"))).status).toBe(200);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(await db.prisma.telegramUpdate.count()).toBe(1);
    expect((await deliver(callbackUpdate(302, crypto.randomUUID()))).status).toBe(200);
    expect(answerCallbackQuery).toHaveBeenCalled();
    expect(await db.prisma.transaction.count()).toBe(0);
  });

  it("queries only stored owner records and cancels an existing clarification on a command", async () => {
    await connect();
    const pending = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    await telegram.approvePendingAction(alice, sender, pending.id);
    await deliver(messageUpdate(400, "Makan"));
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("CLARIFICATION");
    await deliver(messageUpdate(401, "/balance 2026-11"));
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("RM 12.50"), undefined);
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    await deliver(messageUpdate(404, "/report 2026-11"));
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Makanan & Minuman: RM 12.50"), undefined);
    await deliver(messageUpdate(405, "/budget 2026-11"));
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Tiada bajet"), undefined);
    await deliver(messageUpdate(406, "/help"));
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Cakap macam biasa"), undefined);
    await deliver(messageUpdate(407, "/link"));
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("masukkan kod"), undefined);
    await deliver(messageUpdate(402, "kopi RM8 lepas tu minyak RM40"));
    expect((await telegram.getPendingAction(alice, sender))?.kind).toBe("PROPOSAL");
    await deliver(messageUpdate(403, "/cancel"));
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    expect(await db.prisma.transaction.count()).toBe(1);
  });

  it("replies to meal small talk without opening or interrupting a financial clarification", async () => {
    await connect();
    expect((await deliver(messageUpdate(690, "hello dah makan ke"))).status).toBe(200);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(sender, "Kalau bot boleh makan, saya dah pesan nasi lemak 😄", undefined);
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    await deliver(messageUpdate(691, "Makan"));
    const clarification = await telegram.getPendingAction(alice, sender);
    expect(clarification?.kind).toBe("CLARIFICATION");
    await deliver(messageUpdate(692, "Awak dah makan?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("nasi lemak"), undefined);
    expect((await telegram.getPendingAction(alice, sender))?.id).toBe(clarification?.id);
    await deliver(messageUpdate(693, "RM12"));
    expect(await telegram.getPendingAction(alice, sender)).toMatchObject({
      kind: "PROPOSAL", payload: { transactions: [{ amount: "12.00", categoryId: food }] },
    });
    expect(await db.prisma.transaction.count()).toBe(0);
  });

  it("handles greetings, a multi-purchase message, missing amounts and monthly totals in casual Malay", async () => {
    await connect();
    await deliver(messageUpdate(700, "hi"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Hai!"), undefined);
    await deliver(messageUpdate(701, "Harini aku beli KFC RM20 dan pergi karaoke 30"));
    const purchases = await telegram.getPendingAction(alice, sender);
    expect(purchases).toMatchObject({ kind: "PROPOSAL", payload: { transactions: [
      { description: "KFC", amount: "20.00", categoryId: food, type: "EXPENSE" },
      { description: "karaoke", amount: "30.00", type: "EXPENSE" },
    ] } });
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringMatching(/Makanan & Minuman[\s\S]*Hiburan/), expect.anything());
    expect(await db.prisma.transaction.count()).toBe(0);
    await deliver(callbackUpdate(702, purchases!.id));
    await db.prisma.transaction.create({ data: { userId: bob, categoryId: foreignCategory, amount: "999", description: "Synthetic foreign", occurredOn: parseDate(todayInMalaysia()), type: "EXPENSE", source: "WEB" } });
    await deliver(messageUpdate(703, "Hi, berapa aku spend bulan ni."));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringMatching(/Jumlah belanja.*RM 50\.00/), undefined);
    await deliver(messageUpdate(699, "bagi report perbenjaan ku bulan ni"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender,
      expect.stringContaining("Jumlah belanja: RM 50.00\nBelanja mengikut kategori\nHiburan: RM 30.00\nMakanan & Minuman: RM 20.00"), undefined);

    await deliver(messageUpdate(704, "aku belanja awek makan"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Berapa amaun"), undefined);
    await deliver(messageUpdate(705, "RM25 je"));
    expect((await telegram.getPendingAction(alice, sender))?.payload).toMatchObject({ transactions: [{ amount: "25.00", categoryId: food, type: "EXPENSE" }] });

    await deliver(messageUpdate(706, "aku dapat duit poket daripada abang"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Berapa amaun"), undefined);
    await deliver(messageUpdate(707, "RM50"));
    const pocketMoney = await telegram.getPendingAction(alice, sender);
    expect(pocketMoney).toMatchObject({ kind: "PROPOSAL", payload: { transactions: [{ amount: "50.00", type: "INCOME" }] } });
    await deliver(callbackUpdate(708, pocketMoney!.id));
    await deliver(messageUpdate(709, "berapa duit aku dapat bulan ni"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringMatching(/Jumlah pendapatan.*RM 50\.00/), undefined);
    expect(await db.prisma.transaction.count({ where: { userId: alice } })).toBe(3);
  });

  it("clarifies, lists, creates and records payment for a bill with separate approvals", async () => {
    await connect();
    await db.prisma.recurringBill.create({ data: { userId: bob, categoryId: foreignCategory, name: "ShopeePay", amount: "999.99", cadence: "MONTHLY", nextDueOn: parseDate(todayInMalaysia()), dayOfMonth: 1 } });
    await deliver(messageUpdate(710, "Ada bil kena bayar tak?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Tiada bil"), undefined);
    await deliver(messageUpdate(723, "Aku ada bil kena bayar"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bil apa"), undefined);
    await deliver(messageUpdate(711, "Bil ShopeePay kena bayar"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Berapa amaun bil ShopeePay"), undefined);
    await deliver(messageUpdate(712, "RM30"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bila bil ShopeePay"), undefined);
    await deliver(messageUpdate(713, "2024-01-31"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("bulanan atau tahunan"), undefined);
    await deliver(messageUpdate(714, "setiap bulan"));
    const creation = await telegram.getPendingAction(alice, sender);
    expect(creation).toMatchObject({ kind: "PROPOSAL", payload: { operation: "create_bill", bill: { name: "ShopeePay", cadence: "MONTHLY", amount: "30.00" } } });
    expect(await db.prisma.recurringBill.count({ where: { userId: alice } })).toBe(0);
    await deliver(messageUpdate(715, "ya"));
    expect(await db.prisma.recurringBill.count({ where: { userId: alice } })).toBe(0);
    await deliver(callbackUpdate(716, creation!.id));
    await deliver(callbackUpdate(717, creation!.id));
    expect(await db.prisma.recurringBill.count({ where: { userId: alice } })).toBe(1);
    expect(await db.prisma.transaction.count()).toBe(0);
    await deliver(messageUpdate(718, "bila kena bayar bil shopeepay?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("RM 30.00 pada 2024-01-31"), undefined);
    await deliver(messageUpdate(719, "/bills"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("2024-01-31 (tertunggak)"), undefined);
    await deliver(messageUpdate(720, "Aku dah bayar bil shopeepay RM32 semalam"));
    const payment = await telegram.getPendingAction(alice, sender);
    expect(payment).toMatchObject({ kind: "PROPOSAL", payload: { operation: "pay_bill", nextDueOn: "2024-01-31", payment: { amount: "32.00" } } });
    expect(await db.prisma.transaction.count()).toBe(0);
    await deliver(callbackUpdate(721, payment!.id));
    await deliver(callbackUpdate(722, payment!.id));
    const saved = await db.prisma.transaction.findMany();
    expect(saved.map((row) => [row.userId, row.amount.toFixed(2), row.type, row.source])).toEqual([[alice, "32.00", "EXPENSE", "TELEGRAM"]]);
    const bill = await db.prisma.recurringBill.findFirstOrThrow({ where: { userId: alice } });
    expect(bill.nextDueOn.toISOString().slice(0, 10)).toBe("2024-02-29");
    expect(bill.version).toBe(1);
  });

  it("keeps planned bills out of spent totals and rejects a stale payment after the web schedule changes", async () => {
    await connect();
    await deliver(messageUpdate(730, "Bil telefon RM80 setiap bulan, kena bayar esok"));
    const action = await telegram.getPendingAction(alice, sender);
    expect(action).toMatchObject({ kind: "PROPOSAL", payload: { operation: "create_bill", bill: { name: "telefon", amount: "80.00" } } });
    await deliver(callbackUpdate(731, action!.id));
    await deliver(messageUpdate(732, "berapa aku spend bulan ni?"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("RM 0.00"), undefined);
    await deliver(messageUpdate(733, "Dah bayar bil telefon"));
    const payment = await telegram.getPendingAction(alice, sender);
    expect(payment).toMatchObject({ kind: "PROPOSAL", payload: { operation: "pay_bill" } });
    await db.prisma.recurringBill.updateMany({ where: { userId: alice }, data: { version: { increment: 1 }, amount: "85" } });
    await deliver(callbackUpdate(734, payment!.id));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Butiran bil sudah berubah"), undefined);
    expect(await db.prisma.transaction.count()).toBe(0);
  });

  it("handles natural bill commands and asks which bill an unnamed payment refers to", async () => {
    await connect();
    const today = parseDate(todayInMalaysia());
    const daysFromToday = (days: number) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + days);
      return date;
    };
    const [first, later] = [daysFromToday(35), daysFromToday(40)];
    await db.prisma.recurringBill.createMany({ data: [
      { userId: alice, categoryId: food, name: "ShopeePay", amount: "25", cadence: "MONTHLY", nextDueOn: first, dayOfMonth: first.getUTCDate() },
      { userId: alice, categoryId: food, name: "Synthetic later", amount: "50", cadence: "MONTHLY", nextDueOn: later, dayOfMonth: later.getUTCDate() },
      { userId: alice, categoryId: food, name: "Synthetic overdue", amount: "50", cadence: "MONTHLY", nextDueOn: daysFromToday(-1), dayOfMonth: daysFromToday(-1).getUTCDate() },
      { userId: alice, categoryId: food, name: "Synthetic paused", amount: "50", cadence: "MONTHLY", nextDueOn: today, dayOfMonth: today.getUTCDate(), active: false },
      { userId: bob, categoryId: foreignCategory, name: "Synthetic foreign", amount: "999", cadence: "MONTHLY", nextDueOn: today, dayOfMonth: today.getUTCDate() },
    ] });
    await deliver(messageUpdate(750, "tambah bil"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bil apa"), undefined);
    await deliver(messageUpdate(751, "bil terdekat apa"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining(`Bil terdekat\nBil ShopeePay perlu dibayar RM 25.00 pada ${first.toISOString().slice(0, 10)}`), undefined);
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();

    await deliver(messageUpdate(756, "kemas kini bil ShopeePay dah dibayar RM24 semalam"));
    expect(await telegram.getPendingAction(alice, sender)).toMatchObject({
      kind: "PROPOSAL", payload: { operation: "pay_bill", name: "ShopeePay", payment: { amount: "24.00", occurredOn: daysFromToday(-1).toISOString().slice(0, 10) } },
    });
    await deliver(messageUpdate(752, "update bil tu dah dibayar"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bil mana yang dah dibayar?"), undefined);
    const paymentQuestion = await telegram.getPendingAction(alice, sender);
    expect(paymentQuestion).toMatchObject({ kind: "CLARIFICATION", payload: { operation: "pay_bill" } });
    await deliver(messageUpdate(753, "Synthetic foreign"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("tak jumpa bil aktif"), undefined);
    expect((await telegram.getPendingAction(alice, sender))?.id).toBe(paymentQuestion?.id);

    await deliver(messageUpdate(754, "ShopeePay"));
    const proposal = await telegram.getPendingAction(alice, sender);
    expect(proposal).toMatchObject({ kind: "PROPOSAL", payload: { operation: "pay_bill", name: "ShopeePay", payment: { amount: "25.00" } } });
    expect(await db.prisma.transaction.count()).toBe(0);
    await deliver(callbackUpdate(755, proposal!.id));
    expect(await db.prisma.transaction.findFirst()).toMatchObject({ userId: alice, description: "ShopeePay", type: "EXPENSE", source: "TELEGRAM" });
    expect(await db.prisma.recurringBill.findFirst({ where: { userId: alice, name: "ShopeePay" } })).toMatchObject({ version: 1 });
  });
});

describe("Settings server action boundaries", () => {
  const mutate = (values: Record<string, string>) => {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => form.set(key, value));
    return mutateTelegram({ ok: false, message: "" }, form);
  };
  it("derives identity from its real session, validates unlink confirmation and never trusts browser IDs", async () => {
    const linked = await mutate({ operation: "link", userId: bob, telegramUserId: foreignSender });
    expect(linked).toMatchObject({ ok: true, linkUrl: expect.stringMatching(/^https:\/\/t.me\/DuitFlowTestBot\?start=[A-Za-z0-9_-]{43}$/) });
    expect(await db.prisma.telegramLinkToken.count({ where: { userId: alice } })).toBe(1);
    expect(await db.prisma.telegramLinkToken.count({ where: { userId: bob } })).toBe(0);
    const challenge = await telegram.redeemLinkToken(new URL(linked.linkUrl!).searchParams.get("start")!, sender);
    if (typeof challenge === "string") throw new Error(challenge);
    expect(await mutate({ operation: "confirmLink", code: "X".repeat(16) })).toMatchObject({ ok: false });
    expect(await mutate({ operation: "confirmLink", code: challenge.code, userId: bob, telegramUserId: foreignSender })).toMatchObject({ ok: true });
    expect(await mutate({ operation: "unlink" })).toMatchObject({ ok: false });
    expect(await telegram.resolveTelegramUser(sender)).toMatchObject({ id: alice });
    expect(await mutate({ operation: "unlink", confirmUnlink: "yes", userId: bob })).toMatchObject({ ok: true });
    expect(await telegram.resolveTelegramUser(sender)).toBeNull();
    await db.prisma.session.deleteMany({ where: { userId: alice } });
    expect(await mutate({ operation: "link" })).toMatchObject({ ok: false, message: expect.stringContaining("Sesi tidak sah") });
    expect(await mutate({ operation: "unlink", confirmUnlink: "yes" })).toMatchObject({ ok: false });
  });
});
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });

describe("Telegram linking with real signed web sessions and PostgreSQL", () => {
  it("returns a valid short token once, persists only its hash and consumes it exactly once", async () => {
    const issued = await telegram.createLinkToken(alice);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await db.prisma.telegramLinkToken.findFirstOrThrow({ where: { userId: alice } });
    expect(stored.hashedToken).toBe(createHash("sha256").update(issued.token).digest("hex"));
    expect(stored.hashedToken).not.toContain(issued.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60000);
    const results = await Promise.all([telegram.redeemLinkToken(issued.token, sender), telegram.redeemLinkToken(issued.token, sender)]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.prisma.telegramConnection.count()).toBe(0);
    expect(await telegram.redeemLinkToken(issued.token, foreignSender)).toBe("CONFLICT");
    const challenge = results[0];
    if (typeof challenge === "string") throw new Error(challenge);
    await expect(telegram.confirmTelegramLink(bob, challenge.code)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const confirmations = await Promise.all([telegram.confirmTelegramLink(alice, challenge.code), telegram.confirmTelegramLink(alice, challenge.code)]);
    expect(confirmations.sort()).toEqual([false, true]);
    expect(await db.prisma.telegramConnection.count()).toBe(1);
    expect(await telegram.resolveTelegramUser(sender)).toMatchObject({ id: alice });
    expect(await telegram.getTelegramSettings(alice)).toMatchObject({ telegramUserId: sender });
  });

  it("rejects expired, replaced, unknown tokens and prevents silently moving an identity", async () => {
    const replaced = await telegram.createLinkToken(alice);
    const current = await telegram.createLinkToken(alice);
    expect(await telegram.redeemLinkToken(replaced.token, sender)).toBe("INVALID");
    await db.prisma.telegramLinkToken.updateMany({ where: { userId: alice }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await telegram.redeemLinkToken(current.token, sender)).toBe("INVALID");
    expect(await telegram.redeemLinkToken("x".repeat(43), sender)).toBe("INVALID");
    await connect();
    await signIn(bob);
    const other = await telegram.createLinkToken(bob);
    expect(await telegram.redeemLinkToken(other.token, sender)).toBe("CONFLICT");
    expect(await telegram.resolveTelegramUser(sender)).toMatchObject({ id: alice });
    const challenge = await telegram.redeemLinkToken(other.token, foreignSender);
    if (typeof challenge === "string") throw new Error(challenge);
    expect(await telegram.confirmTelegramLink(bob, challenge.code)).toBe(true);
    expect(await telegram.resolveTelegramUser(foreignSender)).toMatchObject({ id: bob });
  });

  it("checks sessions independently, denies cross-user browser requests and blocks demo linking", async () => {
    for (const operation of [() => telegram.getTelegramSettings(bob), () => telegram.createLinkToken(bob), () => telegram.unlinkTelegram(bob)]) await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.prisma.user.update({ where: { id: alice }, data: { isDemo: true } });
    await expect(telegram.createLinkToken(alice)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.prisma.session.deleteMany({ where: { userId: alice } });
    for (const operation of [() => telegram.getTelegramSettings(alice), () => telegram.createLinkToken(alice), () => telegram.unlinkTelegram(alice)]) await expect(operation()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("unlinks, invalidates actions and old tokens, and denies old callbacks even after relinking", async () => {
    await connect();
    const pending = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    await telegram.unlinkTelegram(alice);
    expect(await telegram.resolveTelegramUser(sender)).toBeNull();
    expect(await db.prisma.pendingTelegramAction.count({ where: { userId: alice, consumedAt: null } })).toBe(0);
    expect((await db.prisma.pendingTelegramAction.findUniqueOrThrow({ where: { id: pending.id } })).payload).toBeNull();
    expect(await db.prisma.telegramLinkToken.count({ where: { userId: alice, consumedAt: null } })).toBe(0);
    await expect(telegram.approvePendingAction(alice, sender, pending.id)).rejects.toBeInstanceOf(telegram.TelegramAccessError);
    await connect();
    expect(await telegram.approvePendingAction(alice, sender, pending.id)).toBeNull();
    expect((await db.prisma.pendingTelegramAction.findUniqueOrThrow({ where: { id: pending.id } })).payload).toBeNull();
    expect(await db.prisma.transaction.count()).toBe(0);
  });
});

describe("atomic and scoped Telegram proposals", () => {
  it("stores a pending proposal without writing finance, and double-tap/replay saves only once", async () => {
    await connect();
    const pending = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    expect(await db.prisma.transaction.count()).toBe(0);
    const results = await Promise.all([telegram.approvePendingAction(alice, sender, pending.id), telegram.approvePendingAction(alice, sender, pending.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject([{ amount: "12.50", occurredOn: "2026-11-01", categoryName: "Makanan & Minuman" }]);
    expect(await telegram.approvePendingAction(alice, sender, pending.id)).toBeNull();
    const rows = await db.prisma.transaction.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: alice, source: "TELEGRAM" });
  });

  it("rejects expired, cancelled, superseded and cross-account callbacks", async () => {
    await connect();
    const first = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    const second = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    expect(await telegram.approvePendingAction(alice, sender, first.id)).toBeNull();
    expect((await telegram.cancelPendingAction(alice, sender, first.id)).count).toBe(0);
    expect((await telegram.getPendingAction(alice, sender))?.id).toBe(second.id);
    await db.prisma.pendingTelegramAction.update({ where: { id: second.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await telegram.approvePendingAction(alice, sender, second.id)).toBeNull();
    await signIn(bob);
    const issued = await telegram.createLinkToken(bob);
    const challenge = await telegram.redeemLinkToken(issued.token, foreignSender);
    if (typeof challenge === "string") throw new Error(challenge);
    expect(await telegram.confirmTelegramLink(bob, challenge.code)).toBe(true);
    const active = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    expect(await telegram.approvePendingAction(bob, foreignSender, active.id)).toBeNull();
    await expect(telegram.approvePendingAction(alice, foreignSender, active.id)).rejects.toBeInstanceOf(telegram.TelegramAccessError);
    await telegram.cancelPendingAction(alice, sender, active.id);
    expect(await telegram.approvePendingAction(alice, sender, active.id)).toBeNull();
    expect(await db.prisma.transaction.count()).toBe(0);
  });

  it("rolls back consumption and every inserted row on a foreign category or type mismatch", async () => {
    await connect();
    for (const categoryId of [foreignCategory, income]) {
      const pending = await telegram.replacePendingAction(alice, sender, "PROPOSAL", { transactions: [...proposal(food).transactions, ...proposal(categoryId).transactions] });
      await expect(telegram.approvePendingAction(alice, sender, pending.id)).rejects.toBeInstanceOf(telegram.TelegramAccessError);
      expect(await db.prisma.transaction.count()).toBe(0);
      expect((await db.prisma.pendingTelegramAction.findUniqueOrThrow({ where: { id: pending.id } })).consumedAt).toBeNull();
    }
  });

  it("never approves clarification or malformed persisted payloads", async () => {
    await connect();
    const pending = await telegram.replacePendingAction(alice, sender, "CLARIFICATION", { transactions: [{ type: "EXPENSE", description: "Synthetic meal", occurredOn: "2026-11-01", categoryId: food }], index: 0, field: "amount" });
    expect(await telegram.approvePendingAction(alice, sender, pending.id)).toBeNull();
    const invalid = await telegram.replacePendingAction(alice, sender, "PROPOSAL", proposal(food));
    await db.prisma.pendingTelegramAction.update({ where: { id: invalid.id }, data: { payload: { transactions: [{ amount: "-1", userId: bob }] } } });
    await expect(telegram.approvePendingAction(alice, sender, invalid.id)).rejects.toThrow();
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await db.prisma.pendingTelegramAction.findUniqueOrThrow({ where: { id: invalid.id } })).consumedAt).toBeNull();
  });

  it("supports all-or-nothing multiple transactions and exact database-backed monthly reports/budgets", async () => {
    await connect();
    const items = [{ ...proposal(food, "0.10").transactions[0] }, { ...proposal(food, "0.20").transactions[0] }, { ...proposal(income, "1000").transactions[0], type: "INCOME" }];
    const pending = await telegram.replacePendingAction(alice, sender, "PROPOSAL", { transactions: items });
    expect(await telegram.approvePendingAction(alice, sender, pending.id)).toHaveLength(3);
    await db.prisma.budget.create({ data: { userId: alice, categoryId: food, year: 2026, month: 11, limitAmount: "100" } });
    await db.prisma.transaction.create({ data: { ...proposal(foreignCategory, "5000").transactions[0], type: "EXPENSE", userId: bob, occurredOn: new Date("2026-11-01") } });
    expect(await telegram.getTelegramReport(alice, sender, "2026-11")).toMatchObject({ income: "1000.00", expense: "0.30", net: "999.70", breakdown: [{ categoryName: "Makanan & Minuman", amount: "0.30" }] });
    expect(await telegram.getTelegramReport(alice, sender, "2026-10")).toMatchObject({ income: "0.00", expense: "0.00", net: "0.00" });
    expect(await telegram.getTelegramBudgets(alice, sender, "2026-11")).toMatchObject([{ categoryName: "Makanan & Minuman", spent: "0.30", remaining: "99.70" }]);
    for (const operation of [() => telegram.getTelegramCategories(bob, sender), () => telegram.getPendingAction(bob, sender), () => telegram.getTelegramReport(bob, sender, "2026-11"), () => telegram.getTelegramBudgets(bob, sender, "2026-11"), () => telegram.cancelPendingAction(bob, sender), () => telegram.replacePendingAction(bob, sender, "PROPOSAL", proposal(food))]) await expect(operation()).rejects.toBeInstanceOf(telegram.TelegramAccessError);
  });
});
