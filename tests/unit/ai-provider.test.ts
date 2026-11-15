import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { geminiProvider } from "../../src/lib/ai/provider";
import { GEMINI_MODEL } from "../../src/lib/config/ai";

const request = { message: "Synthetic lunch RM12", today: "2026-11-15", categoryNames: ["Makanan & Minuman"] };
const fetchMock = vi.fn();
const response = (parts: unknown = [{ text: '{"synthetic":true}' }], finishReason = "STOP") => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts }, finishReason }], usageMetadata: { candidatesTokenCount: 10 } }));
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("bounded direct Gemini adapter (mock HTTP only)", () => {
  it("uses the fixed model/endpoint, no tools/history/cache, and a server-only key header", async () => {
    fetchMock.mockResolvedValue(response());
    const signal = new AbortController().signal;
    expect(await geminiProvider("synthetic-key").parse(request, signal)).toBe('{"synthetic":true}');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain("synthetic-key");
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", signal, headers: { "x-goog-api-key": "synthetic-key" } });
    const body = JSON.parse(options.body);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(request);
    expect(body.contents).toHaveLength(1); expect(body.tools).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.additionalProperties).toBe(false);
  });
  it.each([400, 401, 403, 429, 500, 503])("redacts %s errors and never retries paid/failover models", async (status) => {
    fetchMock.mockResolvedValue(new Response("sensitive-output-and-key", { status }));
    await expect(geminiProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => response([{ functionCall: { name: "save", args: {} } }]),
    () => response([{ text: "one" }, { text: "two" }]),
    () => response([{ text: "partial" }], "MAX_TOKENS"),
    () => response([{ text: "text", thought: true }]),
    () => new Response("{bad-json"),
    () => new Response(" ".repeat(32001)),
    () => new Response("small", { headers: { "content-length": "32001" } }),
    () => new Response(JSON.stringify({ candidates: [] })),
  ])("rejects malformed, blocked, tool, partial or oversized responses", async (makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    await expect(geminiProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
  });
  it("rejects oversized inputs before any network request", async () => {
    await expect(geminiProvider("synthetic-key").parse({ ...request, message: "x".repeat(4001) }, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redacts network errors", async () => {
    fetchMock.mockRejectedValue(new Error("private-key-in-upstream-error"));
    await expect(geminiProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
  });
});
