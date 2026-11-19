import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramUpdate } from "../../src/lib/telegram/update";

const mock = vi.hoisted(() => ({
  approvePendingAction: vi.fn(), cancelPendingAction: vi.fn(), getActionForUpdate: vi.fn(), getPendingAction: vi.fn(), getTelegramBudgets: vi.fn(), getTelegramCategories: vi.fn(), getTelegramReport: vi.fn(), redeemLinkToken: vi.fn(), replacePendingAction: vi.fn(), resolveTelegramUser: vi.fn(), sendMessage: vi.fn(), answerCallbackQuery: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/telegram/dal", () => ({ ...mock, TelegramAccessError: class extends Error {} }));
vi.mock("@/lib/telegram/transport", () => ({
  sendMessage: mock.sendMessage, answerCallbackQuery: mock.answerCallbackQuery,
  TelegramTransportError: class extends Error { constructor(public readonly retryable: boolean) { super("TELEGRAM_DELIVERY_FAILED"); } },
}));
vi.mock("@/lib/ai/parser", async () => {
  const { parseTelegramText } = await import("../../src/lib/telegram/parser");
  return { parseTransactionWithAi: async (_userId: string, _sender: string, text: string, categories: Parameters<typeof parseTelegramText>[1]) => parseTelegramText(text, categories) };
});

import { processTelegramUpdate } from "../../src/lib/telegram/processor";
import { TelegramTransportError } from "../../src/lib/telegram/transport";

const pendingId = "dca888d0-ceb7-4aeb-8475-0c357353f93b";
const callback = (): TelegramUpdate => ({ update_id: 100, callback_query: { id: "synthetic-callback", from: { id: 12345, is_bot: false }, message: { message_id: 1, chat: { id: 12345, type: "private" } }, data: `a:${pendingId}` } });
const message = (text = "Makan RM12"): TelegramUpdate => ({ update_id: 100, message: { message_id: 1, from: { id: 12345, is_bot: false }, chat: { id: 12345, type: "private" }, text } });
const categories = [{ id: "food", name: "Makanan & Minuman", transactionType: "EXPENSE" }];
const stored = () => ({ id: pendingId, kind: "PROPOSAL", consumedAt: null, expiresAt: new Date(Date.now() + 600_000), payload: { transactions: [{ categoryId: "food", type: "EXPENSE", amount: "12.00", description: "Original synthetic record", occurredOn: "2026-11-15" }] } });

beforeEach(() => {
  vi.resetAllMocks();
  mock.resolveTelegramUser.mockResolvedValue({ id: "synthetic-user", connectionId: "synthetic-connection" });
  mock.answerCallbackQuery.mockResolvedValue(undefined);
  mock.sendMessage.mockResolvedValue(undefined);
  mock.approvePendingAction.mockResolvedValue(null);
  mock.getTelegramCategories.mockResolvedValue(categories);
  mock.getActionForUpdate.mockResolvedValue(null);
  mock.getPendingAction.mockResolvedValue(null);
});

describe("message delivery effect idempotency", () => {
  it("suppresses a financial report if its Telegram connection changes before delivery", async () => {
    mock.getTelegramReport.mockResolvedValue({ income: "99.00", expense: "0.00", net: "99.00" });
    mock.resolveTelegramUser.mockResolvedValueOnce({ id: "synthetic-user", connectionId: "old" })
      .mockResolvedValueOnce({ id: "synthetic-user", connectionId: "new" });
    await processTelegramUpdate(message("/balance"));
    expect(mock.getTelegramReport).toHaveBeenCalledOnce();
    expect(mock.sendMessage).not.toHaveBeenCalled();
  });
  it("does not replace an already consumed proposal when its original message retries", async () => {
    mock.getActionForUpdate.mockResolvedValue({ ...stored(), consumedAt: new Date() });
    await processTelegramUpdate(message());
    expect(mock.getActionForUpdate).toHaveBeenCalledExactlyOnceWith("synthetic-user", "12345", 100);
    expect(mock.replacePendingAction).not.toHaveBeenCalled();
    expect(mock.getPendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", expect.stringContaining("sudah diproses atau tamat tempoh"), undefined);
  });

  it("does not replace an expired proposal on retry", async () => {
    mock.getActionForUpdate.mockResolvedValue({ ...stored(), expiresAt: new Date(Date.now() - 1) });
    await processTelegramUpdate(message());
    expect(mock.replacePendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", expect.stringContaining("sudah diproses atau tamat tempoh"), undefined);
  });

  it("re-presents the exact stored proposal and same buttons without parsing the original again", async () => {
    mock.getActionForUpdate.mockResolvedValue(stored());
    await processTelegramUpdate(message("Gaji RM9999"));
    expect(mock.replacePendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", expect.stringContaining("Original synthetic record"), { inline_keyboard: [[{ text: "Sahkan", callback_data: `a:${pendingId}` }, { text: "Batal", callback_data: `c:${pendingId}` }]] });
    expect(mock.sendMessage.mock.calls.at(-1)![1]).toContain("RM 12.00");
    expect(mock.sendMessage.mock.calls.at(-1)![1]).not.toContain("9999");
  });

  it("re-presents the stored clarification rather than merging/re-parsing a retried message", async () => {
    mock.getActionForUpdate.mockResolvedValue({ ...stored(), kind: "CLARIFICATION", payload: { transactions: [{ type: "EXPENSE", description: "Original synthetic record", categoryId: "food", occurredOn: "2026-11-15" }], field: "amount", index: 0 } });
    await processTelegramUpdate(message("RM9999"));
    expect(mock.replacePendingAction).not.toHaveBeenCalled();
    expect(mock.getPendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", expect.stringContaining("Berapa amaun untuk “Original synthetic record”"), undefined);
  });

  it("binds new proposals to the update id and renders the DAL's persisted payload", async () => {
    mock.replacePendingAction.mockResolvedValue(stored());
    await processTelegramUpdate(message());
    expect(mock.replacePendingAction).toHaveBeenCalledWith("synthetic-user", "12345", "PROPOSAL", expect.any(Object), 100, undefined);
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", expect.stringContaining("Original synthetic record"), expect.any(Object));
  });

  it("refuses invalid stored payloads instead of attaching approval buttons", async () => {
    mock.getActionForUpdate.mockResolvedValue({ ...stored(), payload: { transactions: [], userId: "foreign" } });
    await processTelegramUpdate(message());
    expect(mock.replacePendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).toHaveBeenLastCalledWith("12345", "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula.", undefined);
  });
});

describe("callback processing failure and acknowledgement", () => {
  it("never interprets an uppercase cancel code as approval", async () => {
    const update = callback();
    update.callback_query!.data = `C:${pendingId}`;
    mock.cancelPendingAction.mockResolvedValue({ count: 1 });
    await processTelegramUpdate(update);
    expect(mock.approvePendingAction).not.toHaveBeenCalled();
    expect(mock.cancelPendingAction).toHaveBeenCalledWith("synthetic-user", "12345", pendingId);
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", "Cadangan dibatalkan.");
  });

  it("preserves a database failure when an expired callback acknowledgement also fails", async () => {
    const databaseFailure = new Error("SYNTHETIC_DATABASE_UNAVAILABLE");
    mock.approvePendingAction.mockRejectedValue(databaseFailure);
    mock.answerCallbackQuery.mockRejectedValue(new TelegramTransportError(false));
    await expect(processTelegramUpdate(callback())).rejects.toBe(databaseFailure);
    expect(mock.approvePendingAction).toHaveBeenCalledWith("synthetic-user", "12345", pendingId);
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", expect.any(String));
    expect(mock.sendMessage).not.toHaveBeenCalled();
  });

  it("preserves a retryable saved-reply delivery failure if callback acknowledgement is permanent", async () => {
    const deliveryFailure = new TelegramTransportError(true);
    mock.approvePendingAction.mockResolvedValue([{ id: "synthetic-record", categoryName: "Makanan & Minuman", amount: "12.00", type: "EXPENSE", description: "Synthetic record", occurredOn: "2026-11-15" }]);
    mock.sendMessage.mockRejectedValue(deliveryFailure);
    mock.answerCallbackQuery.mockRejectedValue(new TelegramTransportError(false));
    await expect(processTelegramUpdate(callback())).rejects.toBe(deliveryFailure);
    expect(mock.sendMessage).toHaveBeenCalledWith("12345", expect.stringContaining("RM 12.00"), undefined);
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", "Transaksi disimpan.");
  });

  it("propagates acknowledgement failure when processing itself succeeded", async () => {
    const acknowledgementFailure = new TelegramTransportError(true);
    mock.answerCallbackQuery.mockRejectedValue(acknowledgementFailure);
    await expect(processTelegramUpdate(callback())).rejects.toBe(acknowledgementFailure);
    expect(mock.approvePendingAction).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid_data", "", "a:not-a-uuid"])("acknowledges invalid callback data %s without approving", async (data) => {
    const update = callback();
    update.callback_query!.data = data;
    await processTelegramUpdate(update);
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", expect.any(String));
    expect(mock.approvePendingAction).not.toHaveBeenCalled();
  });

  it("acknowledges unlinked callbacks and does not read or write finances", async () => {
    mock.resolveTelegramUser.mockResolvedValue(null);
    await processTelegramUpdate(callback());
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", "Sambungkan akaun di Tetapan dahulu.");
    expect(mock.approvePendingAction).not.toHaveBeenCalled();
    expect(mock.sendMessage).not.toHaveBeenCalled();
  });

  it("acknowledges a group callback without even resolving an identity", async () => {
    const update = callback();
    update.callback_query!.message!.chat = { id: -123, type: "group" };
    await processTelegramUpdate(update);
    expect(mock.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith("synthetic-callback", expect.any(String));
    expect(mock.resolveTelegramUser).not.toHaveBeenCalled();
    expect(mock.approvePendingAction).not.toHaveBeenCalled();
  });
});
