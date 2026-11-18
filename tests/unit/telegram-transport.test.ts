import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
const transport = vi.hoisted(() => ({ request: vi.fn(), end: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: transport.request }));
import { answerCallbackQuery, sendMessage, TelegramTransportError, TELEGRAM_FETCH_TIMEOUT_MS } from "../../src/lib/telegram/transport";

function upstream(body: unknown, status = 200, error?: Error) {
  transport.request.mockImplementation((_options, respond) => {
    const outgoing = new EventEmitter();
    return Object.assign(outgoing, { end: (payload: Buffer) => {
      transport.end(payload);
      if (error) outgoing.emit("error", error);
      else respond(Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { statusCode: status, headers: {} }));
    } });
  });
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:synthetic-telegram-token-longer-than-twenty");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "synthetic-telegram-webhook-secret-longer-than32");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "DuitFlowTestBot");
  transport.request.mockReset();
  transport.end.mockReset();
  upstream({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("Telegram transport", () => {
  it("sends bounded plain text, disables caching, and supplies a network deadline", async () => {
    await sendMessage("12345", "Synthetic <b>text</b>", { inline_keyboard: [[{ text: "Sahkan", callback_data: "c:00000000-0000-4000-8000-000000000000" }]] });
    const options = transport.request.mock.calls[0][0];
    expect(options.hostname).toBe("api.telegram.org");
    expect(options.headers["Cache-Control"]).toBe("no-store");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(transport.end.mock.calls[0][0].toString())).toEqual({ chat_id: "12345", text: "Synthetic <b>text</b>", protect_content: true, link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: "Sahkan", callback_data: "c:00000000-0000-4000-8000-000000000000" }]] } });
  });
  it("answers callback spinners", async () => {
    await answerCallbackQuery("synthetic-id", "Sudah diproses.");
    expect(JSON.parse(transport.end.mock.calls[0][0].toString())).toEqual({ callback_query_id: "synthetic-id", text: "Sudah diproses." });
  });
  it("enforces callback data bytes and message length before calling Telegram", async () => {
    await expect(sendMessage("12345", "x".repeat(4097))).rejects.toThrow();
    await expect(sendMessage("12345", "x", { inline_keyboard: [[{ text: "x", callback_data: "é".repeat(33) }]] })).rejects.toThrow();
    expect(transport.request).not.toHaveBeenCalled();
  });
  it("redacts network failures and marks them retryable", async () => {
    upstream(null, 0, new Error("sensitive-url-and-token"));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
  });
  it("uses a4s deadline and redacts a simulated timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    upstream(null, 0, new DOMException("sensitive-timeout-details", "TimeoutError"));
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(TELEGRAM_FETCH_TIMEOUT_MS).toBe(4000);
    timeout.mockRestore();
  });
  it.each([429, 500, 503])("retries temporary API failure %i", async (status) => {
    upstream({ ok: false, description: "sensitive-details" }, status);
    await expect(answerCallbackQuery("synthetic-id")).rejects.toMatchObject({ retryable: true });
  });
  it("distinguishes permanent delivery rejection", async () => {
    upstream({ ok: false }, 403);
    await expect(sendMessage("12345", "Synthetic text")).rejects.toEqual(new TelegramTransportError(false));
  });
  it.each([{ status: 200, body: {} }, { status: 200, body: { ok: false, error_code: 429 } }, { status: 401, body: { ok: false } }])("keeps uncertain upstream/configuration failures retryable (%j)", async ({ status, body }) => {
    upstream(body, status);
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ message: "TELEGRAM_DELIVERY_FAILED", retryable: true });
  });
  it("rejects redirects and oversized responses", async () => {
    upstream({ ok: true }, 302);
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ retryable: true });
    upstream({ ok: true, result: "x".repeat(65_537) });
    await expect(sendMessage("12345", "Synthetic text")).rejects.toMatchObject({ retryable: true });
    expect(transport.request).toHaveBeenCalledTimes(2);
  });
});
