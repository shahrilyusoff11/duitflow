import { describe, expect, it } from "vitest";
import { interpretChat } from "../../src/lib/ai/chat";
import { isAiProjection, prepareAiInput } from "../../src/lib/ai/input";

const now = new Date("2026-10-31T16:25:00Z");
const interpret = (text: string, output: unknown) =>
  interpretChat(JSON.stringify(output), prepareAiInput(text)!, text, [], now);

describe("DeepSeek chat grounding", () => {
  it("retains conversational syntax but masks unknown words, owned names, numbers and dates", () => {
    const input = prepareAiInput("Could I spend RM17.23 on Quiet Book Club in 2026-11, with Zorba?", [
      { id: "synthetic-category", name: "Quiet Book Club", transactionType: "EXPENSE" },
    ])!;
    expect(input.message).toBe("Could I spend [AMOUNT_1] on [NAME_2] in [MONTH_3], with [NAME_4]?");
    expect(isAiProjection(input.message)).toBe(true);
    expect(isAiProjection("Could I spend RM17.23 with Zorba?")).toBe(false);
  });
  it("resolves only live message markers and normalizes an amount on the server", () => {
    const text = "Would spending 12 ringgit 50 sen on Quiet Club stretch my budget in 2026-11?";
    const query = { operation: "purchase_check", categoryName: "[NAME_2]", amount: "[AMOUNT_1]", period: "[MONTH_3]" };
    expect(interpret(text, { intent: "finance_query", query })).toMatchObject({
      kind: "FINANCE", query: { amount: "12.50", categoryName: "Quiet Club", period: "2026-11" },
    });
    expect(() => interpret(text, { intent: "finance_query", query: { ...query, amount: "[NAME_2]" } })).toThrow();
    expect(() => interpret(text, { intent: "finance_query", query: { ...query, period: "2026-10" } })).toThrow();
    expect(() => interpret(text, { intent: "finance_query", query: { ...query, categoryName: "[NAME_99]" } })).toThrow();
    expect(() => interpret(text, { intent: "finance_query", query: { ...query, userId: "synthetic-foreign" } })).toThrow();
  });
  it("rejects an ungrounded month, multiple periods and counts beyond the supported limit", () => {
    expect(() => interpret("Where did my cash go this month and last month?", {
      intent: "finance_query", query: { operation: "top_categories", period: "[MONTH_1]" },
    })).toThrow();
    expect(() => interpret("Can you show the last 99 entries?", {
      intent: "finance_query", query: { operation: "recent_transactions", limit: "[NUMBER_1]" },
    })).toThrow();
    expect(() => interpret("Can you show 2 or 3 recent entries?", {
      intent: "finance_query", query: { operation: "recent_transactions", limit: "[NUMBER_1]" },
    })).toThrow();
    expect(() => interpret("What about then?", { intent: "follow_up", kind: "PERIOD", value: "[MONTH_1]" })).toThrow();
  });
  it("asks about an ambiguous payment date instead of defaulting to today", () => {
    expect(interpret("I've settled that bill the other day.", {
      intent: "pay_bill", target: "context", requiresConfirmation: true,
    })).toEqual({ kind: "CLARIFY" });
  });
  it("grounds a payment's name, amount and Malaysian date without asking the provider for values", () => {
    const text = "I've settled the Valhalla bill for RM47.50 yesterday.";
    expect(interpret(text, { intent: "pay_bill", target: "[NAME_1]", requiresConfirmation: true })).toEqual({
      kind: "BILL", bill: { kind: "PAY", name: "Valhalla", payment: { amount: "47.50", occurredOn: "2026-10-31" } },
    });
    expect(() => interpret(text, { intent: "pay_bill", target: "[NAME_1]", requiresConfirmation: false })).toThrow();
    expect(() => interpret(text, { intent: "pay_bill", target: "[NAME_1]", approved: true, requiresConfirmation: true })).toThrow();
    expect(() => interpret(text, { intent: "pay_bill", target: "[AMOUNT_2]", requiresConfirmation: true })).toThrow();
  });
  it.each(["Did I settle that bill?", "I have not paid that bill", "Kalau dah bayar bil itu?", "I can pay that bill tomorrow"])(
    "does not accept a question, negation or future payment as a write", (text) => {
      expect(interpret(text, { intent: "pay_bill", target: "context", requiresConfirmation: true })).toEqual({ kind: "CLARIFY" });
    },
  );
});
