import { parseMoney } from "@/lib/finance/money";
import { parseDate, resolveRelativeDate, todayInMalaysia } from "@/lib/finance/dates";
import { clarificationSchema, proposalSchema, type Clarification, type PartialTransaction, type Proposal } from "./schemas";

export type TelegramCategory = { id: string; name: string; transactionType: "INCOME" | "EXPENSE" };
export type ParseResult = { kind: "PROPOSAL"; payload: Proposal } | { kind: "CLARIFICATION"; payload: Clarification } | { kind: "UNSUPPORTED"; message: string };
const unsupported = (): ParseResult => ({ kind: "UNSUPPORTED", message: "Format ini belum disokong. Cuba Makan RM12 atau Gaji RM2500. Asingkan belian dengan ‘lepas tu’ atau titik koma. Gunakan /balance, /budget atau /report untuk pertanyaan." });

const categoryKeywords: Record<string, RegExp> = {
  "Makanan & Minuman": /\b(makan|makanan|minum|minuman|kopi|nasi|sarapan|lunch|dinner|coffee|food)\b/i,
  "Pengangkutan": /\b(minyak|petrol|diesel|tol|parking|grab|bas|train|transport|fuel)\b/i,
  "Bil & Utiliti": /\b(bil|elektrik|internet|telefon|utiliti|electricity)\b/i,
  "Keperluan Rumah": /\b(barang dapur|dapur|rumah|groceries)\b/i,
  "Kesihatan": /\b(ubat|klinik|hospital|doktor|medicine)\b/i,
  "Hiburan": /\b(wayang|pawagam|hiburan|cinema|movie)\b/i,
  "Gaji": /\b(gaji|salary)\b/i,
  "Pendapatan Sampingan": /\b(freelance|sampingan|bonus|komisen|commission)\b/i,
};

function inferCategory(description: string, type: "INCOME" | "EXPENSE", categories: TelegramCategory[]) {
  const eligible = categories.filter((category) => category.transactionType === type);
  const lower = description.toLocaleLowerCase("ms-MY");
  const exact = eligible.filter((category) => lower === category.name.toLocaleLowerCase("ms-MY"));
  if (exact.length === 1) return exact[0].id;
  const matches = eligible.filter((category) => categoryKeywords[category.name]?.test(description));
  return matches.length === 1 ? matches[0].id : undefined;
}

export function finishParse(transactions: PartialTransaction[]): ParseResult {
  for (const [index, item] of transactions.entries()) {
    if (!item.amount || !item.occurredOn || !item.categoryId) return { kind: "CLARIFICATION", payload: clarificationSchema.parse({ transactions, index, field: !item.amount ? "amount" : !item.occurredOn ? "date" : "category" }) };
  }
  return { kind: "PROPOSAL", payload: proposalSchema.parse({ transactions }) };
}

// Deliberately bounded grammar. Unknown language never authorizes a write or a query.
export function parseTelegramText(text: string, categories: TelegramCategory[], now = new Date()): ParseResult {
  if (!text.trim() || text.length > 4000 || text.trimStart().startsWith("/") || /[+\-\u2212\u2010-\u2015\uFE63\uFF0D\u2796]\s*rm|[?？]|\b(berapa|baki|abaikan|ignore|select|delete|insert|update)\b/i.test(text)) return unsupported();
  const parts = text.trim().split(/\s+(?:lepas tu|kemudian|then)\s+|[;\n]+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 10) return unsupported();
  const transactions: PartialTransaction[] = [];
  for (const part of parts) {
    let description = part;
    let occurredOn = todayInMalaysia(now);
    const dates = [...description.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|hari ini|today|semalam|yesterday|kelmarin|minggu lepas)\b/gi)];
    if (dates.length > 1 || /\b(esok|tomorrow|minggu depan|last month|bulan lepas)\b/i.test(description)) return unsupported();
    if (dates[0]) {
      const dateText = dates[0][0].toLowerCase();
      try {
        occurredOn = /^\d/.test(dateText) ? parseDate(dateText).toISOString().slice(0, 10) : resolveRelativeDate(dateText === "hari ini" || dateText === "today" ? "today" : dateText === "yesterday" ? "semalam" : dateText as "semalam" | "kelmarin" | "minggu lepas", now);
      } catch { return unsupported(); }
      description = description.replace(dates[0][0], " ").trim();
    }
    // Require a complete, whitespace-delimited suffix. Include separated and
    // Unicode signs in the candidate so invalid negatives never become a
    // positive substring ("− 12"), nor a word suffix ("foo12").
    const money = /(?:^|\s)((?:rm\s*)?[+\-\u2212\u2010-\u2015\uFE63\uFF0D\u2796]?\s*\d[\d.,]*(?:k|\s+ringgit(?:\s+\d[\d.,]*\s+sen)?|\s+sen)?)\s*$/i.exec(description);
    let amount: string | undefined;
    if (money) {
      try { amount = parseMoney(money[1].trim()).toFixed(2); } catch { /* Ask, never round or guess. */ }
      description = description.slice(0, money.index).trim();
    }
    description = description.replace(/^(?:tadi\s+)?(?:beli\s+|bayar\s+)/i, "").replace(/\s+/g, " ").trim();
    if (!description || description.length > 500 || /\d|\brm\b/i.test(description)) return unsupported();
    const type = /\b(gaji|salary|pendapatan|income|bonus|komisen|freelance|commission)\b/i.test(description) ? "INCOME" : "EXPENSE";
    const categoryId = inferCategory(description, type, categories);
    if (!money && !categoryId) return unsupported();
    transactions.push({ description, type, occurredOn, ...(amount ? { amount } : {}), ...(categoryId ? { categoryId } : {}) });
  }
  try { return finishParse(transactions); } catch { return unsupported(); }
}

export function continueClarification(payload: unknown, reply: string, categories: TelegramCategory[]): ParseResult | null {
  const parsed = clarificationSchema.safeParse(payload);
  if (!parsed.success || reply.length > 500 || reply.trimStart().startsWith("/")) return null;
  const state = parsed.data;
  const item = state.transactions[state.index];
  if (state.field === "amount") {
    try { item.amount = parseMoney(reply.trim()).toFixed(2); } catch { return null; }
  } else if (state.field === "date") {
    const value = reply.trim().toLowerCase();
    const relative = { today: "today", "hari ini": "today", semalam: "semalam", yesterday: "semalam", kelmarin: "kelmarin", "minggu lepas": "minggu lepas", "last week": "minggu lepas" } as const;
    try { item.occurredOn = Object.hasOwn(relative, value) ? resolveRelativeDate(relative[value as keyof typeof relative]) : parseDate(value).toISOString().slice(0, 10); } catch { return null; }
  } else {
    const matches = categories.filter((category) => category.transactionType === item.type && category.name.toLocaleLowerCase("ms-MY") === reply.trim().toLocaleLowerCase("ms-MY"));
    if (matches.length !== 1) return null;
    item.categoryId = matches[0].id;
  }
  return finishParse(state.transactions);
}

export function clarificationQuestion(payload: Clarification, categories: TelegramCategory[]) {
  const item = payload.transactions[payload.index];
  if (payload.field === "amount") return `Berapa amaun untuk “${item.description}”? Balas contohnya RM12.50. /cancel untuk batal.`;
  if (payload.field === "date") return `Tarikh untuk “${item.description}”? Balas YYYY-MM-DD, hari ini, semalam, kelmarin atau minggu lepas. /cancel untuk batal.`;
  const names = categories.filter((category) => category.transactionType === item.type).map((category) => category.name);
  return `Kategori untuk “${item.description}”? Balas nama tepat: ${names.slice(0, 20).join(", ") || "tiada kategori tersedia; tambah di web dahulu"}${names.length > 20 ? ", atau kategori lain daripada senarai web anda" : ""}. /cancel untuk batal.`;
}
