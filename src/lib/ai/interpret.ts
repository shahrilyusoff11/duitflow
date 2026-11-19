import { defaultCategories } from "@/lib/finance/default-categories";
import { finishParse, resolveTransactionDate, type ParseResult, type TelegramCategory } from "@/lib/telegram/parser";
import type { PartialTransaction } from "@/lib/telegram/schemas";
import { parseAiOutput } from "./schemas";
import type { SourceItem } from "./input";

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

export { resolveTransactionDate as resolveAiDate };

export function interpretAiOutput(raw: string, items: SourceItem[], categories: TelegramCategory[], now: Date, localItems?: PartialTransaction[]): ParseResult {
  const output = parseAiOutput(raw);
  if (output.intent === "unsupported" || output.transactions.length !== items.length || (localItems && localItems.length !== items.length)) throw new Error("UNSUPPORTED_AI_INPUT");
  const byIndex = new Map(output.transactions.map((item) => [item.sourceIndex, item]));
  const transactions: PartialTransaction[] = items.map((source, index) => {
    const item = byIndex.get(index + 1);
    if (!item || item.type !== source.type) throw new Error("UNGROUNDED_TRANSACTION");
    let occurredOn: string | undefined;
    if (source.dateExpression) {
      try { occurredOn = resolveTransactionDate(source.dateExpression, now); } catch { /* Clarify. */ }
    }
    const category = defaultCategories.some((entry) => entry.transactionType === source.type && entry.name === item.categoryName)
      ? categories.find((entry) => entry.transactionType === source.type && entry.name === item.categoryName)
      : undefined;
    const local = localItems?.[index];
    if (local && local.type !== source.type) throw new Error("UNGROUNDED_TRANSACTION");
    return local ? { ...local, categoryId: local.categoryId ?? category?.id } : { type: source.type, description: source.description, amount: source.amount, occurredOn, categoryId: category?.id };
  });
  return finishParse(transactions);
}
