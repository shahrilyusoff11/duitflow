import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goldenCases } from "../fixtures/ai-golden";
import { continueClarification, parseTelegramText, type TelegramCategory } from "../../src/lib/telegram/parser";
import { interpretAiTransactions, matchCategory, resolveAiDate } from "../../src/lib/ai/interpret";
import { aiTransactionsSchema } from "../../src/lib/ai/schemas";
import { prepareAiInput } from "../../src/lib/ai/input";
import { getAiConfig, DEEPSEEK_MODEL, AI_TIMEOUT_MS, readAiEnvironment } from "../../src/lib/config/ai";

const mocks = vi.hoisted(() => ({ consume: vi.fn(), parse: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/telegram/dal", () => ({ consumeTelegramAiAttempt: mocks.consume }));
vi.mock("@/lib/ai/provider", () => ({ deepseekProvider: () => ({ parse: mocks.parse }) }));
import { interpretTelegramWithAi } from "../../src/lib/ai/parser";
import { parseFinanceQuestion } from "../../src/lib/ai/question";

async function interpretMessage(userId: string, sender: string, text: string, categories: TelegramCategory[], now: Date) {
  const query = parseFinanceQuestion(text, categories);
  return query ? { kind: "QUERY" as const, query } : parseTransactionWithAi(userId, sender, text, categories, now);
}

async function parseTransactionWithAi(userId: string, sender: string, text: string, categories: TelegramCategory[], now: Date) {
  const fallback = parseTelegramText(text, categories, now);
  const result = await interpretTelegramWithAi(userId, sender, "synthetic-connection", text, categories, fallback, now);
  return result?.kind === "TRANSACTIONS" ? result.result : fallback;
}

const categories: TelegramCategory[] = [
  { id: "food", name: "Makanan & Minuman", transactionType: "EXPENSE" },
  { id: "transport", name: "Pengangkutan", transactionType: "EXPENSE" },
  { id: "home", name: "Keperluan Rumah", transactionType: "EXPENSE" },
  { id: "salary", name: "Gaji", transactionType: "INCOME" },
];
const now = new Date("2026-10-31T16:30:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER", "deepseek"); vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-not-a-live-api-key");
  vi.stubEnv("DEEPSEEK_MODEL", DEEPSEEK_MODEL);
  vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "30"); vi.stubEnv("AI_MINUTE_LIMIT_PER_USER", "2");
  mocks.consume.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe(`mocked AI golden set (${goldenCases.length} cases)`, () => {
  it.each(goldenCases)("$name", async (fixture) => {
    mocks.parse.mockResolvedValue(typeof fixture.output === "string" ? fixture.output : JSON.stringify(fixture.output));
    const result = await interpretMessage("user-synthetic", "12345", fixture.message, categories, now);
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
  it("preserves safe wording and masks values while handling simple input locally", async () => {
    mocks.parse.mockRejectedValue(new Error("synthetic-secret-output"));
    await parseTransactionWithAi("private-id", "12345", "Makan RM12", categories, now);
    expect(mocks.parse).not.toHaveBeenCalled();
    await parseTransactionWithAi("private-id", "12345", "Paid RM18.92 for brunch with Testname on 2026-11-02", [
      ...categories, { id: "private-category", name: "Private custom label", transactionType: "EXPENSE" },
    ], now);
    const payload = mocks.parse.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["categoryNames", "message"]);
    expect(payload.message).toBe("Paid [AMOUNT_1] for brunch with [NAME_2] on [DATE_3]");
    for (const value of ["Testname", "18.92", "2026-11-02", "Private custom label", "private-id", "12345"]) expect(JSON.stringify(payload)).not.toContain(value);
    expect(mocks.parse.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
  it.each(["Paid RM12 for coffee user@example.test", "Paid RM12 for coffee bank account", "Paid RM12 for coffee 123456789012", "Paid RM12 for coffee OTP"])("keeps blocked sensitive patterns local", async (message) => {
    await parseTransactionWithAi("u", "1", message, categories, now);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it.each(["Show my balance and spending for last month?", "Show 2 or 3 latest transactions", "How much did I spend on food this month and last month?"])("falls back safely on an unclear question", async (message) => {
    expect((await interpretMessage("u", "1", message, categories, now)).kind).toBe("UNSUPPORTED");
  });
  it("works with no key and never requests dispatch permission", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect((await parseTransactionWithAi("u", "12345", "Paid RM12 for brunch", categories, now)).kind).toBe("CLARIFICATION");
    expect(mocks.consume).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled();
  });
  it.each(["quota", "consent", "database failure"])("falls back when %s denies AI", async (reason) => {
    if (reason === "database failure") mocks.consume.mockRejectedValue(new Error("private-db-details"));
    else mocks.consume.mockResolvedValue(false);
    expect((await parseTransactionWithAi("u", "12345", "Paid RM12 for brunch", categories, now)).kind).toBe("CLARIFICATION");
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("bounds a hung provider and aborts it before falling back", async () => {
    vi.useFakeTimers(); mocks.parse.mockReturnValue(new Promise(() => undefined));
    const result = parseTransactionWithAi("u", "12345", "Paid RM12 for brunch", categories, now);
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    expect((await result).kind).toBe("CLARIFICATION");
    expect(mocks.parse.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("revalidates correct dates at year and leap boundaries", () => {
    expect(resolveAiDate("semalam", new Date("2026-12-31T16:30:00Z"))).toBe("2026-12-31");
    expect(resolveAiDate("semalam", new Date("2024-02-29T16:30:00Z"))).toBe("2024-02-29");
  });
  it("clarifies an invalid date then accepts only a server-validated reply", () => {
    const fixture = goldenCases.find((item) => item.name === "Invalid date")!;
    const result = interpretAiTransactions(aiTransactionsSchema.parse(fixture.output), prepareAiInput(fixture.message)!.items, categories, now);
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
  it("binds one result to each source clause and derives full money phrases locally", () => {
    const input = prepareAiInput("Kopi 50 sen then paid 12 ringgit 50 sen for lunch")!;
    const item = { sourceIndex: 1, type: "EXPENSE", categoryName: "Makanan & Minuman" };
    const parsed = (transactions: object[]) => aiTransactionsSchema.parse({ intent: "add_transactions", transactions, requiresConfirmation: true });
    expect(() => interpretAiTransactions(parsed([item, item]), input.items, categories, now)).toThrow("UNGROUNDED_TRANSACTION");
    expect(() => interpretAiTransactions(parsed([item, { ...item, sourceIndex: 2, type: "INCOME" }]), input.items, categories, now)).toThrow("UNGROUNDED_TRANSACTION");
    expect(() => interpretAiTransactions(parsed([item, { ...item, sourceIndex: 2, amount: "12" }]), input.items, categories, now)).toThrow();
    expect(interpretAiTransactions(parsed([{ ...item, sourceIndex: 2 }, item]), input.items, categories, now)).toMatchObject({
      kind: "PROPOSAL", payload: { transactions: [{ amount: "0.50" }, { amount: "12.50" }] },
    });
    for (const message of ["Makan − RM12", "Makan RM1 200"]) expect(prepareAiInput(message)?.items[0].amount).toBeUndefined();
  });
  it("enables the fixed Flash model with a key and rejects invalid settings without revealing secrets", () => {
    const key = "synthetic-key-longer-than20";
    expect(getAiConfig({ AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: key })).toMatchObject({ DEEPSEEK_MODEL });
    expect(getAiConfig({ AI_PROVIDER: "deepseek" })).toBeNull();
    expect(getAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "synthetic-key-longer-than20", GEMINI_FREE_TIER_CONFIRMED: "yes" })).toBeNull();
    expect(getAiConfig({ AI_PROVIDER: "deterministic", DEEPSEEK_API_KEY: key })).toBeNull();
    expect(() => readAiEnvironment({ DEEPSEEK_MODEL: "paid-model-secret" })).toThrow("AI configuration is invalid.");
    expect(() => readAiEnvironment({ AI_DAILY_LIMIT_PER_USER: "31" })).toThrow();
  });
});
