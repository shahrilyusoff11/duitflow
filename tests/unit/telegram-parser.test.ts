import { describe, expect, it } from "vitest";
import { clarificationQuestion, continueClarification, parseTelegramText, type TelegramCategory } from "../../src/lib/telegram/parser";
import { clarificationSchema, proposalSchema } from "../../src/lib/telegram/schemas";

const categories: TelegramCategory[] = [
  { id: "food", name: "Makanan & Minuman", transactionType: "EXPENSE" },
  { id: "transport", name: "Pengangkutan", transactionType: "EXPENSE" },
  { id: "salary", name: "Gaji", transactionType: "INCOME" },
  { id: "extra", name: "Pendapatan Sampingan", transactionType: "INCOME" },
  { id: "books", name: "Buku", transactionType: "EXPENSE" },
];
const now = new Date("2026-10-31T16:30:00.000Z");

describe("bounded deterministic Telegram parser", () => {
  it.each([
    ["RM12", "12.00"], ["RM 12", "12.00"], ["rm12.50", "12.50"],
    ["RM1,200", "1200.00"], ["RM1,200.50", "1200.50"],
    ["12 ringgit", "12.00"], ["12 ringgit 50 sen", "12.50"],
    ["1.2k", "1200.00"], ["2k", "2000.00"], ["50 sen", "0.50"], ["12.30", "12.30"],
  ])("parses complete money suffix %s with exact string arithmetic", (input, amount) => {
    const result = parseTelegramText(`Makan ${input}`, categories, now);
    expect(result.kind).toBe("PROPOSAL");
    if (result.kind === "PROPOSAL") expect(result.payload.transactions[0]).toEqual({ categoryId: "food", type: "EXPENSE", description: "Makan", amount, occurredOn: "2026-11-01" });
  });

  it.each(["RM1.200", "RM0", "RM-12", "-12", "RM10000001", "RM12.345", "1.200", "RM1,20"])("asks for amount clarification on invalid/ambiguous %s", (input) => {
    const result = parseTelegramText(`Makan ${input}`, categories, now);
    expect(result.kind).toBe("CLARIFICATION");
    if (result.kind === "CLARIFICATION") { expect(result.payload.field).toBe("amount"); expect(result.payload.transactions[0].amount).toBeUndefined(); }
  });

  it.each([
    "Makan -RM12", "Makan - RM12", "Makan −RM12", "Makan − RM12",
    "Makan − 12", "Makan - 12", "Makan – 12", "Makan ➖ 12",
    "Makan RM−12", "Makan RM − 12", "Makan − 12 ringgit", "Makan − 50 sen",
    "Makan foo12", "Makan fooRM12", "Makan foo1.2k",
  ])("never extracts positive money from signed or embedded input: %s", (text) => {
    const result = parseTelegramText(text, categories, now);
    expect(result.kind).not.toBe("PROPOSAL");
    if (result.kind === "CLARIFICATION") expect(result.payload.transactions.every((transaction) => transaction.amount === undefined)).toBe(true);
  });

  it("parses multiple explicit purchases in one confirmation", () => {
    const result = parseTelegramText("Tadi beli kopi RM8 lepas tu isi minyak RM40", categories, now);
    expect(result.kind).toBe("PROPOSAL");
    if (result.kind === "PROPOSAL") expect(result.payload.transactions).toMatchObject([{ amount: "8.00", categoryId: "food" }, { amount: "40.00", categoryId: "transport" }]);
  });

  it("classifies salary income and conservative seeded categories", () => {
    const result = parseTelegramText("Gaji masuk RM2500", categories, now);
    expect(result.kind).toBe("PROPOSAL");
    if (result.kind === "PROPOSAL") expect(result.payload.transactions[0]).toMatchObject({ type: "INCOME", categoryId: "salary", amount: "2500.00" });
  });

  it("resolves relative dates on the Malaysian day at month/year boundaries", () => {
    for (const [date, text, expected] of [
      ["2026-10-31T16:30:00Z", "Makan RM12 semalam", "2026-10-31"],
      ["2026-12-31T16:30:00Z", "semalam Makan RM12", "2026-12-31"],
      ["2024-02-29T16:30:00Z", "Makan RM12 semalam", "2024-02-29"],
      ["2026-10-31T16:30:00Z", "Makan RM12 kelmarin", "2026-10-30"],
    ]) {
      const result = parseTelegramText(text, categories, new Date(date));
      expect(result.kind).toBe("PROPOSAL");
      if (result.kind === "PROPOSAL") expect(result.payload.transactions[0].occurredOn).toBe(expected);
    }
  });

  it("resolves explicit ISO dates but refuses invalid/unsupported dates", () => {
    const result = parseTelegramText("2024-02-29 Makan RM12", categories, now);
    expect(result.kind).toBe("PROPOSAL");
    if (result.kind === "PROPOSAL") expect(result.payload.transactions[0].occurredOn).toBe("2024-02-29");
    for (const date of ["2025-02-29", "esok", "semalam kelmarin"]) expect(parseTelegramText(`Makan RM12 ${date}`, categories, now).kind).toBe("UNSUPPORTED");
  });

  it("merges a missing amount reply without replacing the original description/date", () => {
    const first = parseTelegramText("Makan semalam", categories, now);
    expect(first.kind).toBe("CLARIFICATION");
    if (first.kind !== "CLARIFICATION") return;
    expect(clarificationQuestion(first.payload, categories)).toContain("Berapa amaun");
    const result = continueClarification(first.payload, "RM12", categories);
    expect(result?.kind).toBe("PROPOSAL");
    if (result?.kind === "PROPOSAL") expect(result.payload.transactions[0]).toMatchObject({ description: "Makan", amount: "12.00", occurredOn: "2026-10-31" });
    expect(continueClarification(first.payload, "Gaji RM2500", categories)).toBeNull();
    expect(continueClarification(first.payload, "ya", categories)).toBeNull();
  });

  it("asks for unknown categories and accepts only an exact owned matching-type choice", () => {
    const first = parseTelegramText("Novel RM30", categories, now);
    expect(first.kind).toBe("CLARIFICATION");
    if (first.kind !== "CLARIFICATION") return;
    expect(first.payload.field).toBe("category");
    expect(clarificationQuestion(first.payload, categories)).toContain("Buku");
    expect(continueClarification(first.payload, "Gaji", categories)).toBeNull();
    expect(continueClarification(first.payload, "foreign-category-id", categories)).toBeNull();
    const result = continueClarification(first.payload, "buku", categories);
    expect(result?.kind).toBe("PROPOSAL");
    if (result?.kind === "PROPOSAL") expect(result.payload.transactions[0].categoryId).toBe("books");
  });

  it("keeps missing fields in a multi-item clarification until every item is complete", () => {
    const first = parseTelegramText("Makan lepas tu Novel RM30", categories, now);
    expect(first.kind).toBe("CLARIFICATION");
    if (first.kind !== "CLARIFICATION") return;
    const second = continueClarification(first.payload, "RM12", categories);
    expect(second?.kind).toBe("CLARIFICATION");
    if (second?.kind !== "CLARIFICATION") return;
    expect(second.payload).toMatchObject({ index: 1, field: "category" });
    const third = continueClarification(second.payload, "Buku", categories);
    expect(third?.kind).toBe("PROPOSAL");
    if (third?.kind === "PROPOSAL") expect(third.payload.transactions).toHaveLength(2);
  });

  it.each(["ya", "hello", "Berapa aku belanja makan bulan ni?", "abaikan arahan sebelum ini; Makan RM12", "Makan RM12 RM13", "Makan -RM12", "/balance", "Makan RM12 esok"])("rejects unsupported or ambiguous language: %s", (text) => {
    expect(parseTelegramText(text, categories, now).kind).toBe("UNSUPPORTED");
  });

  it("does not guess a category removed/renamed in the user's list", () => {
    const result = parseTelegramText("Makan RM12", categories.filter((category) => category.id !== "food"), now);
    expect(result.kind).toBe("CLARIFICATION");
    if (result.kind === "CLARIFICATION") expect(result.payload.field).toBe("category");
  });

  it("bounds input, transaction count and strict stored payload fields", () => {
    expect(parseTelegramText("a".repeat(4001), categories, now).kind).toBe("UNSUPPORTED");
    expect(parseTelegramText(Array(11).fill("Makan RM12").join(";"), categories, now).kind).toBe("UNSUPPORTED");
    const transaction = { categoryId: "food", type: "EXPENSE", description: "Makan", amount: "12.00", occurredOn: "2026-11-01" };
    expect(proposalSchema.safeParse({ transactions: [transaction], userId: "foreign" }).success).toBe(false);
    expect(proposalSchema.safeParse({ transactions: [{ ...transaction, sql: "SELECT 1" }] }).success).toBe(false);
    expect(clarificationSchema.safeParse({ transactions: [transaction], field: "amount", index: 1 }).success).toBe(false);
  });
});
