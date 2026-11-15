import { parseDate, resolveRelativeDate } from "@/lib/finance/dates";
import { parseMoney } from "@/lib/finance/money";
import { finishParse, type ParseResult, type TelegramCategory } from "@/lib/telegram/parser";
import type { PartialTransaction } from "@/lib/telegram/schemas";
import { parseAiOutput, type FinanceQuery } from "./schemas";

const normalize = (value: string) => value.toLocaleLowerCase("ms-MY").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const aliases: Record<string, string> = { makan: "Makanan & Minuman", makanan: "Makanan & Minuman", food: "Makanan & Minuman", transport: "Pengangkutan", petrol: "Pengangkutan", salary: "Gaji" };
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length];
}
export function matchCategory(name: string, categories: TelegramCategory[], type: "INCOME" | "EXPENSE") {
  const eligible = categories.filter((item) => item.transactionType === type);
  const target = normalize(name);
  const exact = eligible.filter((item) => normalize(item.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  if (Object.hasOwn(aliases, target)) {
    const alias = eligible.filter((item) => normalize(item.name) === normalize(aliases[target]));
    if (alias.length === 1) return alias[0];
    if (alias.length > 1) return undefined;
  }
  if (target.length < 5) return undefined;
  const close = eligible.filter((item) => distance(normalize(item.name), target) <= 1);
  return close.length === 1 ? close[0] : undefined;
}

const relative = { today: "today", "hari ini": "today", yesterday: "semalam", semalam: "semalam", kelmarin: "kelmarin", "minggu lepas": "minggu lepas", "last week": "minggu lepas" } as const;
export function resolveAiDate(expression: string, now: Date) {
  const value = expression.toLowerCase();
  return Object.hasOwn(relative, value) ? resolveRelativeDate(relative[value as keyof typeof relative], now) : parseDate(value).toISOString().slice(0, 10);
}

export type AiInterpretation = ParseResult | { kind: "QUERY"; query: FinanceQuery };

function sourceAmounts(message: string) {
  // Tokenize the entire money phrase, so "50" cannot be lifted from "50 sen",
  // nor "12 ringgit" from "12 ringgit 50 sen". Mask dates before tokenization.
  const source = message.toLowerCase().replace(/\b\d{4}-\d{2}-\d{2}\b/g, (value) => " ".repeat(value.length));
  const tokens = source.matchAll(/(?<![\p{L}\p{N}.,])(?:[+\-−‐-―﹣－➖]\s*)?(?:rm\s*)?(?:[+\-−‐-―﹣－➖]\s*)?\d[\d.,]*(?:k|\s+ringgit(?:\s+\d[\d.,]*\s+sen)?|\s+sen)?(?![\p{L}\p{N}.,])/gu);
  return new Set([...tokens].filter((token) => !/^\s+\d/.test(source.slice(token.index + token[0].length)) && !/\d\s+$/.test(source.slice(0, token.index))).map((token) => token[0].trim().replace(/[.,]+$/, "")));
}

export function interpretAiOutput(raw: string, message: string, categories: TelegramCategory[], now: Date): AiInterpretation {
  const output = parseAiOutput(raw);
  if (output.intent === "unsupported" || output.uncertainty.includes("intent")) throw new Error("UNSUPPORTED_AI_INPUT");
  if (output.intent === "query") {
    if (output.uncertainty.length) throw new Error("AMBIGUOUS_AI_QUERY");
    const query = output.query!;
    if ("period" in query) {
      if (/^\d/.test(query.period) && !message.includes(query.period)) throw new Error("UNGROUNDED_PERIOD");
      if (query.period === "last_month" && !/\b(bulan (?:lepas|lalu)|last month)\b/i.test(message)) throw new Error("UNGROUNDED_PERIOD");
      if (query.period === "this_month" && /\b(bulan (?:lepas|lalu)|last month|\d{4}-\d{2})\b/i.test(message)) throw new Error("AMBIGUOUS_PERIOD");
    }
    return { kind: "QUERY", query: output.query! };
  }
  const moneyLiterals = sourceAmounts(message);
  const transactions: PartialTransaction[] = output.transactions.map((item) => {
    let amount: string | undefined;
    if (item.amount !== null && !output.uncertainty.includes("amount")) {
      // Require a complete source substring. A fabricated/rounded model amount
      // cannot normalize ambiguous user input into a valid financial value.
      if (!moneyLiterals.has(item.amount.trim().toLowerCase())) throw new Error("UNGROUNDED_AMOUNT");
      try { amount = parseMoney(item.amount).toFixed(2); } catch { /* clarify */ }
    }
    let occurredOn: string | undefined;
    if (item.dateExpression && !output.uncertainty.includes("date")) {
      if (item.dateExpression !== "today" && !message.toLowerCase().includes(item.dateExpression.toLowerCase())) throw new Error("UNGROUNDED_DATE");
      // If a model silently discards a stated date, ask rather than default today.
      if (item.dateExpression !== "today" || !/\b(semalam|yesterday|kelmarin|minggu lepas|last week|esok|tomorrow|minggu depan|bulan lepas|last month|\d{4}-\d{2}-\d{2})\b/i.test(message)) {
        try { occurredOn = resolveAiDate(item.dateExpression, now); } catch { /* clarify */ }
      }
    }
    const category = item.categoryName && !output.uncertainty.includes("category") ? matchCategory(item.categoryName, categories, item.type) : undefined;
    return { type: item.type, description: item.description, ...(amount ? { amount } : {}), ...(occurredOn ? { occurredOn } : {}), ...(category ? { categoryId: category.id } : {}) };
  });
  return finishParse(transactions);
}
