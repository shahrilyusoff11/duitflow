import { monthSchema } from "@/lib/finance/validation";
import { type BillIntent, resolveBillDate } from "@/lib/telegram/bills";
import type { ParseResult, TelegramCategory } from "@/lib/telegram/parser";
import { parseChatAmount, plannedWrite } from "@/lib/telegram/text";
import type { PartialTransaction } from "@/lib/telegram/schemas";
import { genericCategoryNames, type prepareAiInput } from "./input";
import { interpretAiTransactions } from "./interpret";
import type { FinanceFollowup } from "./question";
import { aiChatSchema, financeQuerySchema, MAX_AI_OUTPUT_BYTES, type FinanceQuery } from "./schemas";

type Input = NonNullable<ReturnType<typeof prepareAiInput>>;
export type ChatIntent =
  | { kind: "FINANCE"; query: FinanceQuery }
  | { kind: "FOLLOWUP"; followup: FinanceFollowup }
  | { kind: "BILL"; bill: BillIntent }
  | { kind: "TRANSACTIONS"; result: ParseResult }
  | { kind: "SPENDING_CHANGE" }
  | { kind: "CLARIFY" };

function referenced(input: Input, key: string, ...kinds: string[]) {
  const value = input.references.get(key);
  if (!value || !kinds.includes(value.kind)) throw new Error("UNBOUND_AI_REFERENCE");
  return value.text;
}

function fromMonth(value: string) {
  if (/^(?:this month|bulan (?:ini|ni))$/i.test(value)) return "this_month";
  if (/^(?:(?:last|previous|prior) month|bulan (?:lepas|lalu|sebelumnya))$/i.test(value)) return "last_month";
  return monthSchema.parse(value);
}

function monthFor(input: Input, key: string | undefined, text: string) {
  const months = [...input.references.values()].filter((slot) => slot.kind === "MONTH");
  if (months.length > 1 || /(?:\[DATE_|\b(?:weeks?|minggu|years?|tahun)\b)/i.test(input.message) ||
      /\b(?:banding|compare|versus)\b/i.test(text)) throw new Error("UNSUPPORTED_AI_PERIOD");
  const value = key ? referenced(input, key, "MONTH") : months[0]?.text;
  return value ? fromMonth(value.replace(/\s+(?:yang|yg)\s+/i, " ")) : "this_month";
}

function actionAmount(input: Input, key: string) {
  const amounts = [...input.references.values()].filter((slot) => slot.kind === "AMOUNT" || slot.kind === "NUMBER");
  const amount = amounts.length === 1 && parseChatAmount(referenced(input, key, "AMOUNT", "NUMBER"));
  if (!amount) throw new Error("INVALID_AI_AMOUNT");
  return amount;
}

function count(input: Input, key: string | undefined, fallback: number) {
  const numbers = [...input.references.values()].filter((slot) => slot.kind === "NUMBER");
  if (numbers.length > 1) throw new Error("AMBIGUOUS_AI_COUNT");
  const text = key ? referenced(input, key, "NUMBER") : numbers[0]?.text;
  if (!text) return fallback;
  if (!/^\d{1,2}$/.test(text)) throw new Error("INVALID_AI_COUNT");
  return Number(text);
}

function category(input: Input, value: string) {
  return genericCategoryNames.some((name) => name === value) ? value : referenced(input, value, "NAME");
}

function billName(input: Input, target: string, text: string) {
  if (target !== "context") {
    const name = referenced(input, target, "NAME").trim();
    if (name.length > 80) throw new Error("INVALID_AI_BILL_NAME");
    return name;
  }
  const ordinal = /\b(?:yang\s+|(?:bil|ansuran)\s+)(ke[- ]?\d{1,2}|pertama|kedua|ketiga|keempat|kelima)\b/i.exec(text);
  if (ordinal) return "yang " + ordinal[1];
  if (/\b(?:yang\s+(?:tadi|tu|itu|ini|ni|tersebut)|(?:that|this|the previous|the earlier)\s+(?:bill|installment|instalment)|(?:bil|ansuran)\s+(?:tadi|tu|itu|ini|ni|tersebut))\b/i.test(text)) return "bil yang tadi";
  throw new Error("UNBOUND_AI_BILL_CONTEXT");
}

export function interpretChat(raw: string, input: Input, text: string, categories: TelegramCategory[], now: Date, localItems?: PartialTransaction[]): ChatIntent | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_AI_OUTPUT_BYTES) throw new Error("INVALID_AI_OUTPUT");
  const output = aiChatSchema.parse(JSON.parse(raw));
  switch (output.intent) {
    case "unsupported": return null;
    case "clarify": return { kind: "CLARIFY" };
    case "add_transactions":
      return { kind: "TRANSACTIONS", result: interpretAiTransactions(output, input.items, categories, now, localItems) };
    case "spending_change":
      if ([...input.references.values()].some((slot) => slot.kind === "MONTH" && fromMonth(slot.text) !== "this_month")) return { kind: "CLARIFY" };
      return { kind: "SPENDING_CHANGE" };
    case "follow_up": {
      const { kind, value } = output;
      if (kind === "SAVINGS" && !value) return { kind: "FOLLOWUP", followup: { kind } };
      if (kind === "PERIOD" && value) return { kind: "FOLLOWUP", followup: { kind, period: monthFor(input, value, text) } };
      if (kind === "AMOUNT" && value) return { kind: "FOLLOWUP", followup: { kind, amount: actionAmount(input, value) } };
      return { kind: "CLARIFY" };
    }
    case "finance_query": {
      const query = output.query;
      const period = query.operation === "recent_transactions" ? {} : { period: monthFor(input, query.period, text) };
      if (query.operation === "recent_transactions" && [...input.references.values()].some((slot) => slot.kind === "MONTH" || slot.kind === "DATE")) return { kind: "CLARIFY" };
      const grounded = {
        ...query, ...period,
        ...("categoryName" in query && query.categoryName ? { categoryName: category(input, query.categoryName) } : {}),
        ...(query.operation === "recent_transactions" || query.operation === "top_categories" ? {
          limit: count(input, query.limit, 5),
        } : {}),
        ...(query.operation === "spending_trend" ? { months: count(input, query.months, 3) } : {}),
        ...(query.operation === "purchase_check" && query.amount ? { amount: actionAmount(input, query.amount) } : {}),
      };
      return { kind: "FINANCE", query: financeQuerySchema.parse(grounded) };
    }
    case "list_bills":
      return { kind: "BILL", bill: output.view === "DUE" ? { kind: "LIST" } : { kind: "NEXT", installmentsOnly: output.view === "NEXT_INSTALLMENT" } };
    case "lookup_bill":
      return { kind: "BILL", bill: { kind: "LOOKUP", name: billName(input, output.target, text) } };
    case "pay_bill": {
      if (/[?？]|\b(?:not|never|haven't|wasn't|isn't|did i|have i|has it|if|should|maybe)\b/i.test(text) || plannedWrite.test(text) ||
          !/\b(?:paid|settled|cleared|(?:dah|sudah|telah|baru|selesai)\s+(?:bayar|dibayar|settle|clear))\b/i.test(text) ||
          !/\b(?:bil|bills?|ansuran|installments?|instalments?)\b/i.test(text)) return { kind: "CLARIFY" };
      const slots = [...input.references.values()];
      const dates = slots.filter((slot) => slot.kind === "DATE");
      const amounts = slots.filter((slot) => slot.kind === "AMOUNT");
      const occurredOn = dates.length <= 1 && resolveBillDate(dates[0]?.text ?? "today", now, true);
      const amount = amounts[0] && parseChatAmount(amounts[0].text);
      if (!occurredOn || slots.some((slot) => slot.kind === "MONTH" || slot.kind === "NUMBER") || amounts.length > 1 ||
          (amounts.length && !amount)) return { kind: "CLARIFY" };
      const name = output.target && billName(input, output.target, text);
      return { kind: "BILL", bill: { kind: "PAY", name, payment: { occurredOn, amount } } };
    }
  }
}
