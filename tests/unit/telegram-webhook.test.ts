import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getTelegramConfig, isTelegramConfigured, telegramBotUsername } from "../../src/lib/config/telegram";
import { isPrivateTelegramUpdate, telegramUpdateSchema } from "../../src/lib/telegram/update";

const mock = vi.hoisted(() => ({
  process: vi.fn(), claim: vi.fn(), finish: vi.fn(), cleanup: vi.fn(), send: vi.fn(), answer: vi.fn(), after: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mock.after }));
vi.mock("@/lib/telegram/processor", () => ({ processTelegramUpdate: mock.process }));
vi.mock("@/lib/telegram/state", () => ({ claimTelegramUpdate: mock.claim, finishTelegramUpdate: mock.finish, cleanupTelegramState: mock.cleanup }));
vi.mock("@/lib/telegram/transport", () => ({ sendMessage: mock.send, answerCallbackQuery: mock.answer, TelegramTransportError: class extends Error { retryable = false; } }));
import { POST } from "../../src/app/api/telegram/webhook/route";

const configuration = {
  TELEGRAM_BOT_TOKEN: "123456:synthetic-telegram-token-longer-than-twenty",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-telegram-webhook-secret-longer-than32",
  TELEGRAM_BOT_USERNAME: "DuitFlowTestBot",
};
const lease = { updateId: BigInt(10), attempt: 1, lockedAt: new Date() };
const message = { update_id: 10, message: { message_id: 1, from: { id: 12345, is_bot: false }, chat: { id: 12345, type: "private" }, text: "Makan RM12" } };
const request = (body: unknown = message, secret: string | null = configuration.TELEGRAM_WEBHOOK_SECRET, headers: Record<string, string> = {}) => new Request("http://localhost/api/telegram/webhook", {
  method: "POST", headers: { ...(secret !== null ? { "x-telegram-bot-api-secret-token": secret } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.entries(configuration).forEach(([key, value]) => vi.stubEnv(key, value));
  mock.claim.mockResolvedValue(lease);
  mock.finish.mockResolvedValue(true);
  mock.process.mockResolvedValue(undefined);
  mock.send.mockResolvedValue(undefined);
  mock.answer.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Telegram configuration", () => {
  it("is optional and rejects invalid configuration without disclosing values", () => {
    expect(isTelegramConfigured({})).toBe(false);
    expect(isTelegramConfigured(configuration)).toBe(true);
    expect(() => getTelegramConfig({ ...configuration, TELEGRAM_BOT_TOKEN: "sensitive-value" })).toThrow("Telegram configuration is missing or invalid.");
    expect(telegramBotUsername(configuration)).toBe("DuitFlowTestBot");
    expect(telegramBotUsername({ TELEGRAM_BOT_USERNAME: "bad/name" })).toBeNull();
  });
  it("rejects short/invalid header secrets", () => {
    for (const value of ["short", "x".repeat(257), "x".repeat(32) + "!"]) expect(isTelegramConfigured({ ...configuration, TELEGRAM_WEBHOOK_SECRET: value })).toBe(false);
  });
});

describe("Telegram webhook boundary", () => {
  it.each([null, "incorrect", configuration.TELEGRAM_WEBHOOK_SECRET + "extra"])("rejects missing/wrong secret before body reading or DB work (%s)", async (secret) => {
    const input = request("not json", secret);
    const read = vi.spyOn(input.body!, "getReader");
    expect((await POST(input)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it("fails closed with503 when Telegram is unconfigured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await POST(request())).status).toBe(503);
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it.each(["{", {}, { update_id: "10" }, { update_id: 10, edited_message: {} }, { update_id: 10, message: { bad: true } }, { ...message, callback_query: {} }])("acknowledges authentic malformed/unsupported data with200", async (body) => {
    expect((await POST(request(body))).status).toBe(200);
    expect(mock.process).not.toHaveBeenCalled();
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it("enforces actual streamed bytes even if content-length lies", async () => {
    const oversized = JSON.stringify({ ...message, padding: "x".repeat(66_000) });
    expect((await POST(request(oversized, configuration.TELEGRAM_WEBHOOK_SECRET, { "content-length": "1" }))).status).toBe(200);
    expect(mock.process).not.toHaveBeenCalled();
  });
  it("bounds advertised request size before reading", async () => {
    const input = request(message, configuration.TELEGRAM_WEBHOOK_SECRET, { "content-length": "9999999" });
    const read = vi.spyOn(input.body!, "getReader");
    expect((await POST(input)).status).toBe(200);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["group", "supergroup", "channel"])("does not process %s chats", async (type) => {
    expect((await POST(request({ ...message, message: { ...message.message, chat: { id: -123, type } } }))).status).toBe(200);
    expect(mock.process).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("answers ignored nonprivate/inline callbacks without finance access", async () => {
    for (const chat of [{ id: -1, type: "group" }, undefined]) {
      await POST(request({ update_id: 11, callback_query: { id: "synthetic-callback", from: { id: 12345, is_bot: false }, data: "c:bad", ...(chat ? { message: { message_id: 1, chat } } : {}) } }));
    }
    expect(mock.answer).toHaveBeenCalledTimes(2);
    expect(mock.process).not.toHaveBeenCalled();
  });
  it("ignores mismatched private chat identity and bot senders", async () => {
    for (const from of [{ id: 67890, is_bot: false }, { id: 12345, is_bot: true }]) {
      expect((await POST(request({ ...message, message: { ...message.message, from } }))).status).toBe(200);
    }
    expect(mock.process).not.toHaveBeenCalled();
  });
  it("processes deterministic work, commits DONE then200, and schedules only cleanup", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.process).toHaveBeenCalledWith(message);
    expect(mock.finish).toHaveBeenCalledWith(lease, "DONE");
    expect(mock.after).toHaveBeenCalledTimes(1);
    expect(mock.cleanup).not.toHaveBeenCalled();
    await mock.after.mock.calls[0][0]();
    expect(mock.cleanup).toHaveBeenCalledOnce();
  });
  it("does not reprocess successful duplicate delivery", async () => {
    mock.claim.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(200);
    expect(mock.process).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("keeps busy duplicate delivery retryable until the active worker finishes or its lease expires", async () => {
    mock.claim.mockRejectedValueOnce(new Error("TELEGRAM_UPDATE_BUSY"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(result.headers.get("retry-after")).toBe("2");
    expect(mock.process).not.toHaveBeenCalled();
    expect(mock.finish).not.toHaveBeenCalled();
  });
  it("marks genuine processing failures FAILED and returns503 for retry", async () => {
    mock.process.mockRejectedValueOnce(new Error("synthetic-timeout"));
    expect((await POST(request())).status).toBe(503);
    expect(mock.finish).toHaveBeenCalledWith(lease, "FAILED");
    expect(mock.after).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(mock.process).toHaveBeenCalledTimes(2);
  });
  it("returns503 if claiming or completing the DB state fails", async () => {
    mock.claim.mockRejectedValueOnce(new Error("synthetic-database-failure"));
    expect((await POST(request())).status).toBe(503);
    mock.finish.mockRejectedValueOnce(new Error("synthetic-commit-failure"));
    expect((await POST(request())).status).toBe(503);
    expect(mock.finish).toHaveBeenCalledWith(lease, "FAILED");
  });
  it("keeps delivery retryable if this worker lost its lease before completion", async () => {
    mock.finish.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(503);
    expect(mock.finish).toHaveBeenCalledWith(lease, "DONE");
    expect(mock.after).not.toHaveBeenCalled();
  });
});

describe("Telegram update validation", () => {
  it("strips unrelated personal fields", () => {
    const update = telegramUpdateSchema.parse({ ...message, message: { ...message.message, from: { ...message.message.from, first_name: "Synthetic" }, contact: {} } });
    expect(update).toEqual(message);
    expect(isPrivateTelegramUpdate(update)).toBe(true);
  });
  it("rejects unsafe numeric identity precision", () => {
    expect(telegramUpdateSchema.safeParse({ ...message, update_id: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
  });
});
