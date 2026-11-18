import { financeQuerySchema, type FinanceQuery } from "./schemas";
import type { TelegramCategory } from "@/lib/telegram/parser";

function normalize(text: string) {
  return text.toLocaleLowerCase("ms-MY").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const categoryAliases: Record<string, string> = {
  makan: "Makanan & Minuman", makanan: "Makanan & Minuman", food: "Makanan & Minuman",
  petrol: "Pengangkutan", minyak: "Pengangkutan", transport: "Pengangkutan",
};

export function parseFinanceQuestion(text: string, categories: TelegramCategory[]): FinanceQuery | null {
  if (text.length > 4000) return null;
  const question = text.toLocaleLowerCase("ms-MY").trim();
  if (!/[?？]$/.test(question) && !/^(berapa|how much|show|list|status|top|apakah|tunjuk|senarai)\b/.test(question)) return null;
  if (/\b(ignore|abaikan|instructions|arahan|someone else|orang lain|vs|versus|compare|banding|next month|bulan depan|this week|last week|minggu|tahun|year|yesterday|semalam|esok)\b/.test(question)) return null;
  const periods = [...question.matchAll(/\b(?:\d{4}-\d{2}(?:-\d{2})?|this month|bulan ini|bulan ni|last month|bulan lepas|bulan lalu)\b/g)];
  if (periods.length > 1) return null;
  const periodText = periods[0]?.[0];
  const period = !periodText || /^(?:this month|bulan ini|bulan ni)$/.test(periodText) ? "this_month"
    : /^(?:last month|bulan lepas|bulan lalu)$/.test(periodText) ? "last_month" : periodText;
  const subject = periodText ? question.replace(periodText, " ") : question;
  const candidates = [
    /\b(?:recent|latest|terkini|terbaharu)\b/.test(subject) && /\b(?:transactions?|transaksi)\b/.test(subject) ? "recent_transactions" : null,
    /\b(?:top|tertinggi)\b/.test(subject) && /\b(?:categories|kategori)\b/.test(subject) ? "top_categories" : null,
    /\b(?:budget|bajet)\b/.test(subject) ? "budget_status" : null,
    /\b(?:net|balance|baki|bersih)\b/.test(subject) && !/\b(?:budget|bajet)\b/.test(subject) ? "net_for_period" : null,
    /\b(?:spent|spend|spending|belanja|perbelanjaan)\b/.test(subject) && !/\b(?:top|tertinggi|budget|bajet)\b/.test(subject) ? "spend_by_category" : null,
  ].filter(Boolean);
  if (candidates.length !== 1) return null;
  const [operation] = candidates;
  const counts = [...subject.matchAll(/\b\d+\b/g)];
  const normalized = ` ${normalize(subject)} `;
  const matches = categories.filter((item) => item.transactionType === "EXPENSE" &&
    (normalized.includes(` ${normalize(item.name)} `) || Object.entries(categoryAliases).some(([alias, name]) => item.name === name && normalized.includes(` ${alias} `))));
  let input: unknown;
  if (operation === "recent_transactions" || operation === "top_categories") {
    if (counts.length > 1 || (operation === "recent_transactions" && periodText)) return null;
    const limit = counts.length ? Number(counts[0][0]) : 5;
    input = operation === "recent_transactions" ? { operation, limit } : { operation, period, limit };
  } else {
    if (counts.length) return null;
    if (operation === "net_for_period") input = { operation, period };
    else {
      if (matches.length > 1 || (operation === "spend_by_category" && !matches.length)) return null;
      if (!matches.length && normalize(subject).split(" ").some((word) =>
        !/^(?:what|is|my|show|me|the|budget|status|how|much|left|remaining|bajet|berapa|baki|untuk|saya|aku|tunjuk|semua)$/.test(word))) return null;
      input = { operation, period, ...(matches[0] ? { categoryName: matches[0].name } : {}) };
    }
  }
  const result = financeQuerySchema.safeParse(input);
  return result.success ? result.data : null;
}
