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
vi.mock("@/lib/telegram/transport", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/telegram/transport")>(),
  sendMessage: vi.fn(async () => undefined), answerCallbackQuery: vi.fn(async () => undefined),
}));

import * as telegram from "../../src/lib/telegram/dal";
import { sendMessage, answerCallbackQuery, TelegramTransportError } from "../../src/lib/telegram/transport";
import { POST } from "../../src/app/api/telegram/webhook/route";
import { GET as runCron } from "../../src/app/api/telegram/notifications/route";
import { mutateTelegram } from "../../src/app/(protected)/settings/actions";
import * as updateState from "../../src/lib/telegram/state";
import { parseDate, shiftMonth, todayInMalaysia } from "../../src/lib/finance/dates";
import { listBills, recordBillPayment } from "../../src/lib/finance/dal";
import { runTelegramNotifications } from "../../src/lib/telegram/notifications";

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
    expect(sendMessage).toHaveBeenCalledWith(sender, expect.stringContaining("Hari ini saya isi minyak RM60 dan bayar tol RM8"), undefined);
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
    await deliver(messageUpdate(757, "Dah bayar bil"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("Bil mana yang dah dibayar?"), undefined);
    const paymentQuestion = await telegram.getPendingAction(alice, sender);
    expect(paymentQuestion).toMatchObject({ kind: "CLARIFICATION", payload: { operation: "pay_bill" } });
    await deliver(messageUpdate(758, "Synthetic foreign"));
    expect(sendMessage).toHaveBeenLastCalledWith(sender, expect.stringContaining("tak jumpa bil aktif"), undefined);
    expect((await telegram.getPendingAction(alice, sender))?.id).toBe(paymentQuestion?.id);

    await deliver(messageUpdate(759, "ShopeePay"));
    const proposal = await telegram.getPendingAction(alice, sender);
    expect(proposal).toMatchObject({ kind: "PROPOSAL", payload: { operation: "pay_bill", name: "ShopeePay", payment: { amount: "25.00" } } });
    expect(await db.prisma.transaction.count()).toBe(0);
    await deliver(callbackUpdate(760, proposal!.id));
    expect(await db.prisma.transaction.findFirst()).toMatchObject({ userId: alice, description: "ShopeePay", type: "EXPENSE", source: "TELEGRAM" });
    expect(await db.prisma.recurringBill.findFirst({ where: { userId: alice, name: "ShopeePay" } })).toMatchObject({ version: 1 });
  });
});

describe("Telegram record tools through the webhook", () => {
  async function say(id: number, text: string, identity = sender) {
    expect((await deliver(messageUpdate(id, text, Number(identity)))).status).toBe(200);
    return vi.mocked(sendMessage).mock.lastCall?.[1] ?? "";
  }

  async function confirm(updateId: number, pendingId: string, identity = sender) {
    expect((await deliver(callbackUpdate(updateId, pendingId, Number(identity)))).status).toBe(200);
  }

  async function pendingId() {
    const row = await telegram.getPendingAction(alice, sender);
    expect(row?.kind).toBe("PROPOSAL");
    return row!.id;
  }

  function expense(description: string, amount: string, occurredOn = todayInMalaysia(), userId = alice, categoryId = food) {
    return db.prisma.transaction.create({ data: { userId, categoryId, type: "EXPENSE", description, amount, occurredOn: parseDate(occurredOn) } });
  }

  it("disambiguates KFC, shows before/after, rejects foreign taps and applies edit and undo once", async () => {
    await connect();
    await db.prisma.telegramConnection.create({ data: { userId: bob, telegramUserId: foreignSender } });
    const foreign = await expense("KFC foreign", "999.00", todayInMalaysia(), bob, foreignCategory);
    const first = await expense("KFC lunch", "20.00");
    const second = await expense("KFC dinner", "17.00");
    const choices = await say(1000, "Tukar KFC tadi kepada RM25");
    expect(choices).toMatch(/1\. KFC dinner[\s\S]*2\. KFC lunch/);
    expect(choices).not.toContain(foreign.description);
    const preview = await say(1001, "yang kedua");
    expect(preview).toContain("KFC lunch");
    expect(preview).toContain("RM 20.00 → RM 25.00");
    const edit = await pendingId();
    await confirm(1002, edit, foreignSender);
    expect((await db.prisma.transaction.findUniqueOrThrow({ where: { id: first.id } })).amount.toFixed(2)).toBe("20.00");
    await confirm(1003, edit);
    await confirm(1003, edit);
    await confirm(1004, edit);
    expect((await db.prisma.transaction.findUniqueOrThrow({ where: { id: first.id } })).amount.toFixed(2)).toBe("25.00");
    expect(await say(1005, "Undo catatan terakhir")).toContain("KFC dinner");
    const undo = await pendingId();
    expect(await db.prisma.transaction.count()).toBe(3);
    await confirm(1006, undo);
    await confirm(1007, undo);
    expect(await db.prisma.transaction.findUnique({ where: { id: second.id } })).toBeNull();
    expect(await db.prisma.transaction.count()).toBe(2);
    expect(await say(1008, "Tukar KFC foreign tadi kepada RM1")).toContain("tak jumpa transaksi");
  });

  it("ties transaction references to the latest list in the same chat and rejects expired or changed records", async () => {
    await connect();
    await db.prisma.telegramConnection.create({ data: { userId: bob, telegramUserId: foreignSender } });
    const row = await expense("Synthetic KFC", "20.00");
    await say(1100, "/report");
    expect(await say(1101, "transaksi tu")).toContain("Synthetic KFC");
    expect(await say(1102, "transaksi tu", foreignSender)).not.toContain("Synthetic KFC");
    expect(await say(1103, "Tukar transaksi tu kepada RM25")).toContain("RM 20.00 → RM 25.00");
    const stale = await pendingId();
    await db.prisma.transaction.update({ where: { id: row.id }, data: { amount: "21.00" } });
    await confirm(1104, stale);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("Butiran sudah berubah");
    expect((await db.prisma.transaction.findUniqueOrThrow({ where: { id: row.id } })).amount.toFixed(2)).toBe("21.00");
    await db.prisma.telegramConnection.update({ where: { userId: alice }, data: { recordContextExpiresAt: new Date(0) } });
    expect(await say(1105, "Tukar transaksi tu kepada RM66")).toContain("tak jumpa transaksi");
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
    await say(1106, "Undo catatan terakhir");
    const expired = await pendingId();
    await db.prisma.pendingTelegramAction.update({ where: { id: expired }, data: { expiresAt: new Date(0) } });
    await confirm(1107, expired);
    expect(await db.prisma.transaction.count()).toBe(1);
    await expense("Synthetic legacy payment", "14.00").then((legacy) =>
      db.prisma.transaction.update({ where: { id: legacy.id }, data: { paymentTrackingKnown: false } }));
    expect(await say(1108, "Undo catatan terakhir")).toContain("Rekod lama ini");
    expect(await db.prisma.transaction.count()).toBe(2);
  });

  it("uses the Malaysian next month and preserves an existing budget warning while guarding stale approvals", async () => {
    await connect();
    const period = shiftMonth(todayInMalaysia().slice(0, 7), 1);
    const [year, month] = period.split("-").map(Number);
    const key = { userId: alice, categoryId: food, year, month };
    const create = await say(1200, "Bajet makan bulan depan RM400");
    expect(create).toContain(period);
    expect(create).toContain("Had lama: belum ditetapkan");
    expect(create).toContain("Had baharu: RM 400.00");
    expect(await db.prisma.budget.count()).toBe(0);
    const first = await pendingId();
    await confirm(1201, first);
    await confirm(1202, first);
    const row = await db.prisma.budget.findFirstOrThrow({ where: key });
    expect(row.limitAmount.toFixed(2)).toBe("400.00");
    await db.prisma.budget.update({ where: { id: row.id }, data: { warningAt: 75 } });
    const update = await say(1203, `Ubah bajet makan ${period} kepada RM450`);
    expect(update).toContain("Had lama: RM 400.00");
    expect(update).toContain("Had baharu: RM 450.00");
    const second = await pendingId();
    await db.prisma.budget.update({ where: { id: row.id }, data: { limitAmount: "410.00" } });
    await confirm(1204, second);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("Butiran sudah berubah");
    await say(1205, "Bajet makan bulan depan RM450");
    await confirm(1206, await pendingId());
    const updated = await db.prisma.budget.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.limitAmount.toFixed(2)).toBe("450.00");
    expect(updated.warningAt).toBe(75);
    expect(await say(1207, "Bajet gaji bulan depan RM400")).toContain("Pilih nama kategori belanja");
    expect(await db.prisma.budget.count()).toBe(1);
  });

  it("completes a one-off via the referenced bill and restores the bill and expense atomically on undo", async () => {
    await connect();
    const preview = await say(1300, "Bil tiket RM70 sekali bayar 2026-11-20");
    expect(preview).toContain("Sekali bayar");
    await confirm(1301, await pendingId());
    expect(await say(1302, "bil yang tadi")).toContain("Bil tiket perlu dibayar");
    expect(await say(1303, "Dah bayar bil yang tadi")).toContain("Jadual bil akan selesai");
    const payment = await pendingId();
    await confirm(1304, payment);
    await confirm(1304, payment);
    await confirm(1305, payment);
    const [bill] = await listBills(alice);
    expect(bill).toMatchObject({ completed: true, active: false, paymentsMade: 1, paymentLimit: 1 });
    expect(await db.prisma.transaction.findFirst()).toMatchObject({ billId: bill.id, billPaidVersion: 1 });
    expect(await say(1306, "Undo transaksi tu")).toContain("dibuka semula untuk tarikh 2026-11-20");
    const undo = await pendingId();
    await confirm(1307, undo);
    await confirm(1308, undo);
    expect(await db.prisma.transaction.count()).toBe(0);
    expect((await listBills(alice))[0]).toMatchObject({ active: true, completed: false, paymentsMade: 0, nextDueOn: "2026-11-20", version: 2 });
  });

  it("shares counted and date-bounded installments with web, preserves month-end, and declines a stale bill undo", async () => {
    await connect();
    expect(await say(1400, "Ansuran laptop RM100 2 kali bayar pada 2027-01-31")).toContain("0/2 dibayar");
    await confirm(1401, await pendingId());
    expect(await say(1402, "Dah bayar bil laptop")).toContain("1/2 dibayar");
    await confirm(1403, await pendingId());
    const laptop = (await listBills(alice)).find((bill) => bill.name === "laptop")!;
    expect(laptop).toMatchObject({ nextDueOn: "2027-02-28", paymentsMade: 1, paymentLimit: 2 });
    expect(await say(1404, "Status ansuran laptop")).toContain("1/2 dibayar");
    await say(1405, "Undo catatan terakhir");
    const stale = await pendingId();
    await recordBillPayment(alice, laptop.id, String(laptop.version), { amount: "100.00", occurredOn: todayInMalaysia(), description: "Laptop web" });
    await confirm(1406, stale);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("Butiran sudah berubah");
    expect(await db.prisma.transaction.count()).toBe(2);
    expect(await say(1407, "Bila bil laptop?")).toContain("2/2 dibayar");
    expect(await say(1408, "Ansuran kerusi RM30 sampai 2027-02-28 pada 2027-01-31")).toContain("Ansuran hingga 2027-02-28");
    await confirm(1409, await pendingId());
    await say(1410, "Dah bayar bil kerusi");
    await confirm(1411, await pendingId());
    expect(await say(1412, "Dah bayar bil kerusi")).toContain("Jadual bil akan selesai");
    await confirm(1413, await pendingId());
    expect((await listBills(alice)).find((bill) => bill.name === "kerusi")).toMatchObject({ completed: true, paymentsMade: 2, endsOn: "2027-02-28" });
    expect(await say(1414, "Ansuran kamera RM30 2 kali bayar bermula 2100-12-31")).toContain("Semak nama, amaun dan tarikh");
    expect(await telegram.getPendingAction(alice, sender)).toBeNull();
  });

  it("binds the second bill to its original position and asks for a choice when the reference is ambiguous", async () => {
    await connect();
    const today = parseDate(todayInMalaysia());
    for (const name of ["Synthetic first", "Synthetic second"]) {
      await db.prisma.recurringBill.create({ data: { userId: alice, categoryId: food, name, amount: "15", nextDueOn: today, dayOfMonth: today.getUTCDate(), cadence: "MONTHLY" } });
    }
    expect(await say(1500, "/bills")).toMatch(/1\. Synthetic first[\s\S]*2\. Synthetic second/);
    expect(await say(1501, "Dah bayar bil yang tadi")).toContain("Bil mana yang dah dibayar?");
    expect(await say(1502, "yang kedua")).toContain("Rekod bayaran bil Synthetic second");
    await confirm(1503, await pendingId());
    expect(await db.prisma.transaction.findFirst()).toMatchObject({ description: "Synthetic second" });
    await say(1504, "/cancel");
    expect(await say(1505, "bil yang tadi")).toContain("Saya perlukan rekod");
  });

  it("explains the largest change using matched calendar days, real examples and separately worded suggestions", async () => {
    await connect();
    const current = todayInMalaysia().slice(0, 7);
    const previous = shiftMonth(current, -1);
    await expense("KFC matched current", "140.10", `${current}-01`);
    await expense("Meal matched previous", "20.05", `${previous}-01`);
    const entertainment = await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Hiburan" } });
    const transport = await db.prisma.category.findFirstOrThrow({ where: { userId: alice, name: "Pengangkutan" } });
    await expense("Movie matched current", "20.00", `${current}-01`, alice, entertainment.id);
    await expense("Transport current", "190.00", `${current}-01`, alice, transport.id);
    await expense("Transport previous", "200.00", `${previous}-01`, alice, transport.id);
    const nextMonth = shiftMonth(current, 1);
    await expense("Outside matched dates", "800.00", `${nextMonth}-01`);
    await expense("Other account", "999.00", `${current}-01`, bob, foreignCategory);
    const response = await say(1600, "Kenapa belanja aku naik?");
    expect(response).toContain("tempoh sepadan");
    expect(response).toContain("Belanja naik RM 130.05");
    expect(response).toContain("Makanan & Minuman: RM 20.05 → RM 140.10");
    expect(response).toContain("KFC matched current");
    expect(response).toMatch(/Makanan & Minuman:.*\n• Hiburan:/);
    expect(response).toContain("Cadangan semakan");
    expect(response).not.toMatch(/Other account|Outside matched dates|Transport current/);
  });

  it("requires confirmation to enable, change and stop alerts and the weekly digest", async () => {
    await connect();
    expect(await say(1700, "/peringatan bil 3")).toContain("Tetapan lama");
    expect(await db.prisma.telegramConnection.findUnique({ where: { userId: alice } })).toMatchObject({ billReminderDays: null });
    await confirm(1701, await pendingId());
    expect(await say(1702, "/peringatan bil 0")).toContain("Bil: hari matang");
    await confirm(1703, await pendingId());
    await say(1704, "/peringatan bajet 90");
    await confirm(1705, await pendingId());
    await say(1706, "/mingguan Jumaat");
    const weekly = await pendingId();
    await confirm(1707, weekly);
    await confirm(1708, weekly);
    expect(await db.prisma.telegramConnection.findUnique({ where: { userId: alice } })).toMatchObject({
      weeklyDigestDay: 5, budgetReminderPercent: 90, billReminderDays: 0, notificationVersion: 4,
    });
    await say(1709, "/peringatan off");
    await confirm(1710, await pendingId());
    await say(1711, "/mingguan off");
    await confirm(1712, await pendingId());
    expect(await db.prisma.telegramConnection.findUnique({ where: { userId: alice } })).toMatchObject({
      weeklyDigestDay: null, budgetReminderPercent: null, billReminderDays: null,
    });
  });

  it("delivers opted-in notifications once with overlapping scans and uses Malaysia week/month boundaries", async () => {
    await connect();
    const secret = "synthetic-cron-secret-at-least-32-characters";
    vi.stubEnv("CRON_SECRET", secret);
    const cronRequest = (authorization?: string) => runCron(new Request("http://localhost/api/telegram/notifications", {
      headers: authorization ? { authorization } : {},
    }));
    expect((await cronRequest()).status).toBe(401);
    expect((await cronRequest(`Bearer ${secret}`)).status).toBe(200);
    expect(sendMessage).not.toHaveBeenCalled();
    await db.prisma.telegramConnection.update({ where: { userId: alice }, data: { billReminderDays: 2, budgetReminderPercent: 80, weeklyDigestDay: 1 } });
    await db.prisma.telegramConnection.create({ data: { userId: bob, telegramUserId: foreignSender } });
    await expense("Sunday shop", "45.10", "2026-11-29");
    await expense("Monday shop", "90.00", "2026-11-30");
    await expense("Foreign shop", "999.00", "2026-11-29", bob, foreignCategory);
    await db.prisma.budget.create({ data: { userId: alice, categoryId: food, year: 2026, month: 11, limitAmount: "150.00" } });
    await db.prisma.recurringBill.create({ data: {
      userId: alice, categoryId: food, name: "Synthetic bill due", amount: "30", cadence: "MONTHLY",
      nextDueOn: parseDate("2026-12-02"), dayOfMonth: 2,
    } });
    const malaysiaMonday = new Date("2026-11-29T16:01:00Z");
    const results = await Promise.all([runTelegramNotifications(malaysiaMonday), runTelegramNotifications(malaysiaMonday)]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(3);
    expect(vi.mocked(sendMessage).mock.calls).toHaveLength(3);
    const allMessages = vi.mocked(sendMessage).mock.calls.map(([chat, body]) => {
      expect(chat).toBe(sender);
      return body;
    }).join("\n");
    expect(allMessages).toContain("Peringatan bil");
    expect(allMessages).toContain("Peringatan bajet · 2026-11");
    expect(allMessages).toContain("Ringkasan mingguan · 2026-11-23 hingga 2026-11-29");
    expect(allMessages).toContain("Jumlah belanja direkod: RM 45.10");
    expect(allMessages).toContain("Makanan & Minuman: RM 14.90");
    expect(allMessages).not.toContain("999");
    expect((await runTelegramNotifications(new Date("2026-11-30T03:00:00Z"))).sent).toBe(0);
  });

  it("retries explicit rate limits after the delay and never repeats delivery after an uncertain response", async () => {
    await connect();
    await db.prisma.telegramConnection.update({ where: { userId: alice }, data: { billReminderDays: 3, weeklyDigestDay: 1 } });
    await db.prisma.recurringBill.create({ data: {
      userId: alice, categoryId: food, name: "Synthetic bill", amount: "30", cadence: "MONTHLY",
      nextDueOn: parseDate("2026-12-02"), dayOfMonth: 2,
    } });
    const monday = new Date("2026-11-30T01:15:00Z");
    vi.mocked(sendMessage).mockRejectedValueOnce(new TelegramTransportError(true, 30)).mockRejectedValueOnce(new TelegramTransportError(true));
    expect(await runTelegramNotifications(monday)).toMatchObject({ sent: 0, failed: 2 });
    expect((await runTelegramNotifications(new Date(monday.getTime() + 10_000))).sent).toBe(0);
    expect((await runTelegramNotifications(new Date(monday.getTime() + 60_000))).sent).toBe(1);
    expect((await runTelegramNotifications(new Date(monday.getTime() + 120_000))).sent).toBe(0);
    expect(vi.mocked(sendMessage).mock.calls).toHaveLength(3);
    expect(vi.mocked(sendMessage).mock.lastCall?.[1]).toContain("Peringatan bil");
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
