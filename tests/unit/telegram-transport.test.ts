import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { answerCallbackQuery, sendMessage, TelegramTransportError, TELEGRAM_FETCH_TIMEOUT_MS } from "../../src/lib/telegram/transport";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:synthetic-telegram-token-longer-than-twenty");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "synthetic-telegram-webhook-secret-longer-than32");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "DuitFlowTestBot");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Telegram transport", () => {
  it("sends bounded plain text, disables caching, and supplies a network deadline", async () => {
    await sendMessage("12345", "Synthetic <b>text</b>", { inline_keyboard: [[{ text: "Sahkan", callback_data: "c:00000000-0000-4000-8000-000000000000" }]] });
    const options = vi.mocked(fetch).mock.calls[0][1]!;
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body as string)).toEqual({ chat_id: "12345", text: "Synthetic <b>text</b>", reply_markup: { inline_keyboard: [[{ text: "Sahkan", callback_data: "c:00000000-0000-4000-8000-000000000000" }]] } });
  });
  it("answers callback spinners", async () => {
    await answerCallbackQuery("synthetic-id", "Sudah diproses.");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ callback_query_id: "synthetic-id", text: "Sudah diproses." });
  });
  it("enforces callback data bytes and message length before calling Telegram", async () => {
    await expect(sendMessage("12345", "x".repeat(4097))).rejects.toThrow();
    await expect(sendMessage("12345", "x", { inline_keyboard: [[{ text: "x", callback_data: "é".repeat(33) }]] })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("redacts network failures and marks them retryable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("sensitive-url-and-token"));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
  });
  it("uses a4s deadline and redacts a simulated timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.mocked(fetch).mockRejectedValue(new DOMException("sensitive-timeout-details", "TimeoutError"));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(TELEGRAM_FETCH_TIMEOUT_MS).toBe(4000);
    timeout.mockRestore();
  });
  it.each([429, 500, 503])("retries temporary API failure %i", async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: false, description: "sensitive-details" }, { status }));
    await expect(answerCallbackQuery("synthetic-id")).rejects.toMatchObject({ retryable: true });
  });
  it("distinguishes permanent delivery rejection", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: false }, { status: 403 }));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toEqual(new TelegramTransportError(false));
  });
  it.each([{ status: 200, body: {} }, { status: 200, body: { ok: false, error_code: 429 } }, { status: 401, body: { ok: false } }])("keeps uncertain upstream/configuration failures retryable (%j)", async ({ status, body }) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
  });
});
