import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deepseekProvider } from "../../src/lib/ai/provider";

const request = { message: "Item 1: EXPENSE; lunch", categoryNames: ["Makanan & Minuman"] };
const fetchMock = vi.fn();
const response = (message: object = { content: '{"synthetic":true}' }, finishReason = "stop") => new Response(JSON.stringify({
  choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason }],
  usage: { completion_tokens: 10 },
}));
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("bounded direct DeepSeek adapter (mock HTTP only)", () => {
  it("uses the fixed model/endpoint, no tools/history/cache, and a server-only key header", async () => {
    fetchMock.mockResolvedValue(response());
    const signal = new AbortController().signal;
    expect(await deepseekProvider("synthetic-key").parse(request, signal)).toBe('{"synthetic":true}');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(url).not.toContain("synthetic-key");
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", signal, headers: { Authorization: "Bearer synthetic-key" } });
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      model: "deepseek-flash",
      messages: [{ role: "system", content: expect.stringContaining("JSON schema:") }, { role: "user", content: JSON.stringify(request) }],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 4096,
    });
  });
  it.each([400, 401, 402, 403, 429, 500, 503])("redacts %s errors and makes one HTTP request", async (status) => {
    fetchMock.mockResolvedValue(new Response("sensitive-output-and-key", { status }));
    await expect(deepseekProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => response({ content: "{}", tool_calls: [{ function: { name: "save", arguments: "{}" } }] }),
    () => response({ content: "{}", server_tool_calls: [{ type: "web_search" }] }),
    () => response({ content: "partial" }, "length"),
    () => response({ content: "{}" }, "content_filter"),
    () => response({ content: "   " }),
    () => response({ content: null }),
    () => new Response("{bad-json"),
    () => new Response(" ".repeat(32001)),
    () => new Response("small", { headers: { "content-length": "32001" } }),
    () => new Response(JSON.stringify({ choices: [] })),
  ])("rejects malformed, blocked, tool, partial or oversized responses", async (makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    await expect(deepseekProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
  });
  it("rejects oversized inputs before any network request", async () => {
    await expect(deepseekProvider("synthetic-key").parse({ ...request, message: "x".repeat(4001) }, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { ...request, message: "Paid RM12 to a private name" },
    { ...request, message: "Item 1: EXPENSE; lunch testname" },
    { ...request, categoryNames: ["User-authored category"] },
  ])("refuses unprojected data at the provider boundary", async (input) => {
    await expect(deepseekProvider("synthetic-key").parse(input, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redacts network errors", async () => {
    fetchMock.mockRejectedValue(new Error("private-key-in-upstream-error"));
    await expect(deepseekProvider("synthetic-key").parse(request, new AbortController().signal)).rejects.toThrow(/^AI_PROVIDER_UNAVAILABLE$/);
  });
});
