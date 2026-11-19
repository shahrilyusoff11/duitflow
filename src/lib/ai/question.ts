import { financeQuerySchema, type FinanceQuery, type FinanceTopicQuery } from "./schemas";
import type { TelegramCategory } from "@/lib/telegram/parser";
import { findChatAmounts, parseChatAmount } from "@/lib/telegram/text";

function normalize(text: string) {
  return text.toLocaleLowerCase("ms-MY").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const categoryAliases: Record<string, string> = {
  makan: "Makanan & Minuman", makanan: "Makanan & Minuman", food: "Makanan & Minuman",
  petrol: "Pengangkutan", minyak: "Pengangkutan", transport: "Pengangkutan",
  entertainment: "Hiburan",
};

const totalWords = /^(?:how|much|did|do|i|have|my|the|is|what|total|for|in|on|spent|spend|spending|expenses?|income|earn|earned|berapa|aku|saya|dah|telah|punya|ni|ini|belanja|perbelanjaan|semua|banyak|jumlah|ringgit|duit|habis|pendapatan|dapat|terima|masuk|sebenarnya|kan|lah|weh|boleh|check|cek|semak)$/;
const reportWords = /^(?:report|laporan|ringkasan|spending|expenses?|belanja|perbelanjaan|kewangan|ringkas|terperinci|bulanan|bagi|beri|berikan|boleh|tolong|tunjuk|tunjukkan|semak|nak|aku|ku|saya|punya|my|me|the|show|give|please|for|in|monthly|financial|full|breakdown|ikut|mengikut|kategori|by|category|semua|je|saja|sahaja)$/;
const spending = /\b(?:spent|spend|spending|expenses?|belanja|perbelanjaan|habis)\b/;
const periodPattern = /\b(?:\d{4}-\d{2}(?:-\d{2})?|this month|bulan ini|bulan ni|last month|bulan lepas|bulan lalu)\b/g;
const monthCounts: Record<string, number> = { dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, two: 2, three: 3, four: 4, five: 5, six: 6 };

function relativePeriod(text?: string) {
  if (!text || /^(?:this month|bulan ini|bulan ni)$/.test(text)) return "this_month";
  return /^(?:last month|bulan lepas|bulan lalu)$/.test(text) ? "last_month" : text;
}

function matchExpenseCategories(subject: string, categories: TelegramCategory[]) {
  const normalized = ` ${normalize(subject)} `;
  return categories.filter((item) => item.transactionType === "EXPENSE" &&
    (normalized.includes(` ${normalize(item.name)} `) || Object.entries(categoryAliases).some(([alias, name]) => item.name === name && normalized.includes(` ${alias} `))));
}

function validatedQuery(input: unknown) {
  const result = financeQuerySchema.safeParse(input);
  return result.success ? result.data : null;
}

function parseAnalysisQuestion(subject: string, period: string, categories: TelegramCategory[]): FinanceQuery | null {
  if (/^(?:boleh\b|mampu\b|patut\b|kalau\b|can i\b|should i\b|what if\b)/.test(subject) &&
    /\b(?:belanja|beli|bayar|spend|buy|pay)\b/.test(subject)) {
    const categoriesMatched = matchExpenseCategories(subject, categories);
    const amounts = findChatAmounts(subject);
    const amount = amounts.length === 1 ? parseChatAmount(amounts[0][0]) : undefined;
    return validatedQuery({ operation: "purchase_check", period, amount, categoryName: categoriesMatched.length === 1 ? categoriesMatched[0].name : undefined });
  }
  if (/\btrend\b/.test(subject)) {
    const length = /\b(\d+|dua|tiga|empat|lima|enam|two|three|four|five|six)\s+(?:bulan|months?)\b/.exec(subject)?.[1];
    if (!length && /\d/.test(subject)) return null;
    const months = length ? (Object.hasOwn(monthCounts, length) ? monthCounts[length] : Number(length)) : 3;
    return validatedQuery({ operation: "spending_trend", period, months });
  }
  const savings = /\b(?:jimat|berjimat|cut back|save money|kurangkan|reduce)\b/.test(subject);
  const finance = /\b(?:kewangan|duit|belanja|berbelanja|perbelanjaan|bajet|finances?|spending|expenses?|budget)\b/.test(subject);
  if ((savings && /\b(?:cara|macam mana|bagaimana|mana|nak|boleh|apa|how|where|can|tips)\b/.test(subject)) ||
    (finance && /\b(?:cadangan|cadang(?:kan)?|suggest(?:ions?)?|tips)\b/.test(subject))) {
    return validatedQuery({ operation: "analyze_for_period", period, focus: "SAVINGS" });
  }
  const explicitAnalysis = /\b(?:analisis|analisa|analyse|analyze|review|apa pendapat)\b/.test(subject);
  const generalQuestion = /\b(?:macam mana|bagaimana|how am i doing|how are)\b/.test(subject) &&
    !/\b(?:bajet|budget)\b/.test(subject) && matchExpenseCategories(subject, categories).length === 0;
  if (finance && (explicitAnalysis || generalQuestion)) {
    return validatedQuery({ operation: "analyze_for_period", period, focus: "OVERVIEW" });
  }
  return null;
}

export type FinanceFollowup = { kind: "PERIOD"; period: string } | { kind: "AMOUNT"; amount: string } | { kind: "SAVINGS" };

export function parseFinanceFollowup(text: string): FinanceFollowup | null {
  const reply = text.toLowerCase().trim().replace(/[.?!？]+$/, "").trim();
  if (/^(?:(?:jadi|so)\s+)?(?:apa|ada|bagi|beri)\s+(?:cadangan|tips)(?:\s+(?:pula|pulak|lagi|untuk saya|untuk aku))?$/.test(reply)) {
    return { kind: "SAVINGS" };
  }
  const month = /^(?:(?:kalau|untuk|what about)\s+)?(bulan (?:ni|ini|lepas|lalu)|this month|last month|\d{4}-\d{2})(?:\s+(?:pula|pulak|instead))?$/.exec(reply);
  if (month) return { kind: "PERIOD", period: relativePeriod(month[1]) };
  const amountReply = /^(?:kalau|what about|what if)\s+(.+?)(?:\s+(?:pula|pulak|instead))?$/.exec(reply) ??
    /^(.+?)\s+(?:pula|pulak|instead)$/.exec(reply);
  const amount = amountReply && parseChatAmount(amountReply[1]);
  return amount ? { kind: "AMOUNT", amount } : null;
}

export function continueFinanceTopic(topic: FinanceTopicQuery, followup: FinanceFollowup): FinanceQuery | null {
  if (followup.kind === "SAVINGS") return { operation: "analyze_for_period", period: topic.period, focus: "SAVINGS" };
  if (followup.kind === "AMOUNT") {
    return topic.operation === "purchase_check" ? validatedQuery({ ...topic, amount: followup.amount }) : null;
  }
  return validatedQuery(topic.operation === "purchase_check"
    ? { operation: "budget_status", period: followup.period, categoryName: topic.categoryName }
    : { ...topic, period: followup.period });
}

export function parseFinanceQuestion(text: string, categories: TelegramCategory[]): FinanceQuery | null {
  if (text.length > 4000) return null;
  const question = text.toLocaleLowerCase("ms-MY").trim().replace(/\b(?:perbelanjaan|perbenjaan)(?:ku)?\b/g, "perbelanjaan");
  if (/\b(ignore|abaikan|instructions|arahan|someone else|orang lain|vs|versus|compare|banding|next month|bulan depan|this week|last week|minggu|tahun|year|yesterday|semalam|esok)\b/.test(question)) return null;
  const periods = [...question.matchAll(periodPattern)];
  if (periods.length > 1) return null;
  const periodText = periods[0]?.[0];
  const period = relativePeriod(periodText);
  const subject = (periodText ? question.replace(periodText, " ") : question).trim();
  const analysis = parseAnalysisQuestion(subject, period, categories);
  if (analysis) return analysis;
  const normalizedSubject = normalize(subject);
  if (/\b(?:report|laporan|ringkasan)\b/.test(normalizedSubject) && normalizedSubject.split(" ").every((word) => reportWords.test(word))) {
    const result = financeQuerySchema.safeParse({ operation: "report_for_period", period, view: spending.test(normalizedSubject) ? "EXPENSE" : "FULL" });
    return result.success ? result.data : null;
  }
  if (!/[?？]$/.test(question) && !/\bberapa\b/.test(question) && !/^(how much|show|list|status|top|apakah|tunjuk|senarai|jumlah)\b/.test(question)) return null;
  const candidates = [
    /\b(?:recent|latest|terkini|terbaharu)\b/.test(subject) && /\b(?:transactions?|transaksi)\b/.test(subject) ? "recent_transactions" : null,
    /\b(?:top|tertinggi)\b/.test(subject) && /\b(?:categories|kategori)\b/.test(subject) ? "top_categories" : null,
    /\b(?:budget|bajet)\b/.test(subject) ? "budget_status" : null,
    /\b(?:net|balance|baki|bersih)\b/.test(subject) && !/\b(?:budget|bajet)\b/.test(subject) ? "net_for_period" : null,
    spending.test(subject) && !/\b(?:top|tertinggi|budget|bajet)\b/.test(subject) ? "spend_by_category" : null,
    /\b(?:income|earn|earned|pendapatan|dapat|terima|masuk)\b/.test(subject) ? "income_total" : null,
  ].filter(Boolean);
  if (candidates.length !== 1) return null;
  const [operation] = candidates;
  const counts = [...subject.matchAll(/\b\d+\b/g)];
  const matches = matchExpenseCategories(subject, categories);
  let input: unknown;
  if (operation === "recent_transactions" || operation === "top_categories") {
    if (counts.length > 1 || (operation === "recent_transactions" && periodText)) return null;
    const limit = counts.length ? Number(counts[0][0]) : 5;
    input = operation === "recent_transactions" ? { operation, limit } : { operation, period, limit };
  } else {
    if (counts.length) return null;
    if (operation === "net_for_period") input = { operation, period };
    else if (operation === "income_total" || (operation === "spend_by_category" && !matches.length)) {
      if (!normalize(subject).split(" ").every((word) => totalWords.test(word))) return null;
      input = { operation: "total_for_period", period, type: operation === "income_total" ? "INCOME" : "EXPENSE" };
    }
    else {
      if (matches.length > 1) return null;
      if (!matches.length && normalize(subject).split(" ").some((word) =>
        !/^(?:what|is|my|show|me|the|budget|status|how|much|left|remaining|bajet|berapa|baki|untuk|saya|aku|tunjuk|semua)$/.test(word))) return null;
      input = { operation, period, ...(matches[0] ? { categoryName: matches[0].name } : {}) };
    }
  }
  return validatedQuery(input);
}
