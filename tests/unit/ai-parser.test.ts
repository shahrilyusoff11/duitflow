import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goldenCases } from "../fixtures/ai-golden";
import { continueClarification, type TelegramCategory } from "../../src/lib/telegram/parser";
import { interpretAiOutput, matchCategory, resolveAiDate } from "../../src/lib/ai/interpret";
import { getAiConfig, GEMINI_MODEL, AI_TIMEOUT_MS, readAiEnvironment } from "../../src/lib/config/ai";

const mocks = vi.hoisted(() => ({ consume: vi.fn(), parse: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/telegram/dal", () => ({ consumeTelegramAiAttempt: mocks.consume }));
vi.mock("@/lib/ai/provider", () => ({ geminiProvider: () => ({ parse: mocks.parse }) }));
import { parseWithAi } from "../../src/lib/ai/parser";

const categories: TelegramCategory[] = [
  { id: "food", name: "Makanan & Minuman", transactionType: "EXPENSE" },
  { id: "transport", name: "Pengangkutan", transactionType: "EXPENSE" },
  { id: "home", name: "Keperluan Rumah", transactionType: "EXPENSE" },
  { id: "salary", name: "Gaji", transactionType: "INCOME" },
];
const now = new Date("2026-10-31T16:30:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER", "gemini"); vi.stubEnv("GEMINI_API_KEY", "synthetic-not-a-live-api-key");
  vi.stubEnv("GEMINI_MODEL", GEMINI_MODEL); vi.stubEnv("GEMINI_FREE_TIER_CONFIRMED", "yes");
  vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "30"); vi.stubEnv("AI_MINUTE_LIMIT_PER_USER", "2");
  mocks.consume.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe(`mocked AI golden set (${goldenCases.length} cases)`, () => {
  it.each(goldenCases)("$name", async (fixture) => {
    mocks.parse.mockResolvedValue(typeof fixture.output === "string" ? fixture.output : JSON.stringify(fixture.output));
    const result = await parseWithAi("user-synthetic", "12345", fixture.message, categories, now);
    expect(result.kind).toBe(fixture.expected);
    if (result.kind === "PROPOSAL") {
      if (fixture.amounts) expect(result.payload.transactions.map((item) => item.amount)).toEqual(fixture.amounts);
      expect(result.payload.transactions.map((item) => item.occurredOn)).toEqual(fixture.dates ?? result.payload.transactions.map(() => "2026-11-01"));
      for (const item of result.payload.transactions) expect(categories.find((cat) => cat.id === item.categoryId)?.transactionType).toBe(item.type);
    }
    if (result.kind === "CLARIFICATION") expect(result.payload.field).toBe(fixture.field);
    if (result.kind === "QUERY") expect(result.query).toEqual((fixture.output as { query: unknown }).query);
  });
});

describe("AI availability, privacy and failure boundaries", () => {
  it("sends only message, current Malaysian date and category names", async () => {
    mocks.parse.mockRejectedValue(new Error("synthetic-secret-output"));
    expect((await parseWithAi("private-id", "12345", "Makan RM12", categories, now)).kind).toBe("PROPOSAL");
    expect(mocks.parse.mock.calls[0][0]).toEqual({ message: "Makan RM12", today: "2026-11-01", categoryNames: categories.map((cat) => cat.name) });
    expect(mocks.parse.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
  it("works with no key and never requests dispatch permission", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await parseWithAi("u", "12345", "Makan RM12", categories, now)).kind).toBe("PROPOSAL");
    expect(mocks.consume).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled();
  });
  it.each(["quota", "consent", "database failure"])("falls back when %s denies AI", async (reason) => {
    if (reason === "database failure") mocks.consume.mockRejectedValue(new Error("private-db-details"));
    else mocks.consume.mockResolvedValue(false);
    expect((await parseWithAi("u", "12345", "Makan RM12", categories, now)).kind).toBe("PROPOSAL");
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("bounds a hung provider and aborts it before falling back", async () => {
    vi.useFakeTimers(); mocks.parse.mockReturnValue(new Promise(() => undefined));
    const result = parseWithAi("u", "12345", "Makan RM12", categories, now);
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    expect((await result).kind).toBe("PROPOSAL");
    expect(mocks.parse.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("revalidates correct dates at year and leap boundaries", () => {
    expect(resolveAiDate("semalam", new Date("2026-12-31T16:30:00Z"))).toBe("2026-12-31");
    expect(resolveAiDate("semalam", new Date("2024-02-29T16:30:00Z"))).toBe("2024-02-29");
  });
  it("clarifies an invalid date then accepts only a server-validated reply", () => {
    const fixture = goldenCases.find((item) => item.name === "Invalid date")!;
    const result = interpretAiOutput(JSON.stringify(fixture.output), fixture.message, categories, now);
    expect(result.kind).toBe("CLARIFICATION");
    if (result.kind !== "CLARIFICATION") throw new Error();
    expect(continueClarification(result.payload, "2026-02-30", categories)).toBeNull();
    const next = continueClarification(result.payload, "2024-02-29", categories);
    expect(next?.kind).toBe("PROPOSAL");
    if (next?.kind === "PROPOSAL") expect(next.payload.transactions[0].occurredOn).toBe("2024-02-29");
  });
  it("rejects competing fuzzy category matches and cross-type categories", () => {
    expect(matchCategory("Pengangkutam", [...categories, { id: "another", name: "Pengangkutanm", transactionType: "EXPENSE" }], "EXPENSE")).toBeUndefined();
    expect(matchCategory("Gaji", categories, "EXPENSE")).toBeUndefined();
    expect(matchCategory("constructor", categories, "EXPENSE")).toBeUndefined();
    expect(matchCategory("makan", [...categories, { id: "custom", name: "makan", transactionType: "EXPENSE" }], "EXPENSE")?.id).toBe("custom");
  });
  it("rejects positive or incomplete substrings of full money phrases", () => {
    for (const [message, amount] of [["Makan − RM12", "RM12"], ["Makan 50 sen", "50"], ["Kopi 12 ringgit 50 sen", "12 ringgit"], ["Makan RM1 200", "RM1"]]) {
      const raw = JSON.stringify({ intent: "add_transactions", transactions: [{ type: "EXPENSE", description: "Synthetic", amount, categoryName: "Makanan & Minuman", dateExpression: "today" }], query: null, uncertainty: [], requiresConfirmation: true });
      expect(() => interpretAiOutput(raw, message, categories, now)).toThrow("UNGROUNDED_AMOUNT");
    }
  });
  it("requires explicit owner free-tier attestation and rejects unknown models/caps without secrets", () => {
    expect(getAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "synthetic-key-longer-than20" })).toBeNull();
    expect(getAiConfig({ AI_PROVIDER: "deterministic" })).toBeNull();
    expect(() => readAiEnvironment({ GEMINI_MODEL: "paid-model-secret" })).toThrow("AI configuration is invalid.");
    expect(() => readAiEnvironment({ AI_DAILY_LIMIT_PER_USER: "31" })).toThrow();
  });
});
