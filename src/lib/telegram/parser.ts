import { parseDate, resolveRelativeDate, todayInMalaysia } from "@/lib/finance/dates";
import { clarificationSchema, proposalSchema, type Clarification, type PartialTransaction, type Proposal } from "./schemas";
import { financeDiscussion, findChatAmounts, incomeWords, leadingTransactionDate, parseChatAmount, plannedWrite, splitPurchases, transactionDatePattern, unsupportedWrite } from "./text";

export type TelegramCategory = { id: string; name: string; transactionType: "INCOME" | "EXPENSE" };
export type ParseResult = { kind: "PROPOSAL"; payload: Proposal } | { kind: "CLARIFICATION"; payload: Clarification } | { kind: "UNSUPPORTED"; message: string };
const unsupported = (): ParseResult => ({
  kind: "UNSUPPORTED",
  message: [
    "Saya kurang pasti apa yang anda ingin catat atau semak. Cuba salah satu contoh ini.",
    "",
    "• Catat belanja — “Semalam saya isi minyak RM60.”",
    "• Semak perbelanjaan — “Berapa jumlah perbelanjaan saya bulan ini?”",
    "• Semak bil — “Apakah bil seterusnya?”",
    "",
    "Taip /help untuk lihat semua arahan.",
  ].join("\n"),
});

const categoryKeywords: Record<string, RegExp> = {
  "Makanan & Minuman": /\b(makan|makanan|minum|minuman|kopi|nasi|sarapan|lunch|dinner|breakfast|coffee|food|kfc|burger|pizza|roti|teh|supper)\b/i,
  "Pengangkutan": /\b(minyak|petrol|diesel|tol|parking|grab|bas|train|transport|fuel)\b/i,
  "Bil & Utiliti": /\b(bil|elektrik|internet|telefon|utiliti|electricity)\b/i,
  "Keperluan Rumah": /\b(barang dapur|dapur|rumah|groceries)\b/i,
  "Kesihatan": /\b(ubat|klinik|hospital|doktor|medicine)\b/i,
  "Hiburan": /\b(wayang|pawagam|hiburan|cinema|movie|karaoke|konsert|concert|netflix)\b/i,
  "Gaji": /\b(gaji|salary)\b/i,
  "Pendapatan Sampingan": /\b(freelance|sampingan|bonus|komisen|commission|upah)\b/i,
  "Lain-lain": /\b(duit poket|wang saku|pocket money|elaun|allowance|(?:dapat|terima|received)\s+(?:duit|wang|money))\b/i,
};

function inferCategory(description: string, type: "INCOME" | "EXPENSE", categories: TelegramCategory[]) {
  const eligible = categories.filter((category) => category.transactionType === type);
  const lower = description.toLocaleLowerCase("ms-MY");
  const exact = eligible.filter((category) => lower === category.name.toLocaleLowerCase("ms-MY"));
  if (exact.length === 1) return exact[0].id;
  const matches = eligible.filter((category) => (category.name !== "Lain-lain" || type === "INCOME") &&
    Object.hasOwn(categoryKeywords, category.name) && categoryKeywords[category.name].test(description));
  return matches.length === 1 ? matches[0].id : undefined;
}

export function resolveTransactionDate(expression: string, now = new Date()) {
  const value = expression.toLowerCase().replace(/\s+/g, " ");
  switch (value) {
    case "today": case "hari ini": case "harini": case "hari ni": case "tadi": return todayInMalaysia(now);
    case "semalam": case "yesterday": return resolveRelativeDate("semalam", now);
    case "kelmarin": return resolveRelativeDate("kelmarin", now);
    case "minggu lepas": case "last week": return resolveRelativeDate("minggu lepas", now);
    default: return parseDate(value).toISOString().slice(0, 10);
  }
}

export function finishParse(transactions: PartialTransaction[]): ParseResult {
  for (const [index, item] of transactions.entries()) {
    if (!item.amount || !item.occurredOn || !item.categoryId) return { kind: "CLARIFICATION", payload: clarificationSchema.parse({ transactions, index, field: !item.amount ? "amount" : !item.occurredOn ? "date" : "category" }) };
  }
  return { kind: "PROPOSAL", payload: proposalSchema.parse({ transactions }) };
}

export function parseTelegramText(text: string, categories: TelegramCategory[], now = new Date()): ParseResult {
  if (!text.trim() || text.length > 4000 || text.trimStart().startsWith("/") || /[+\-−‐-―﹣－➖]\s*rm|[?？]|\b(berapa|baki)\b/i.test(text) || unsupportedWrite.test(text) || plannedWrite.test(text) || financeDiscussion.test(text)) return unsupported();
  const parts = splitPurchases(text.trim());
  if (parts.length === 0 || parts.length > 10) return unsupported();
  const inheritedDate = leadingTransactionDate(parts[0]);
  const transactions: PartialTransaction[] = [];
  for (const part of parts) {
    const dates = [...part.matchAll(transactionDatePattern)];
    if (dates.length > 1) return unsupported();
    let occurredOn: string;
    try { occurredOn = resolveTransactionDate(dates[0]?.[0] ?? inheritedDate ?? "today", now); }
    catch { return unsupported(); }
    const clause = part.replace(transactionDatePattern, " ").trim();
    const amounts = findChatAmounts(clause);
    if (amounts.length > 1) return unsupported();
    const literal = amounts[0];
    let description = clause;
    let amount: string | undefined;
    if (literal) {
      const after = clause.slice(literal.index + literal[0].length).trim();
      // Bare numbers inside prose could be counts rather than MYR.
      if (!after || /^(?:rm\s*|[+\-−]\s*rm\s*)|(?:ringgit|sen|k)[.,]?$/i.test(literal[0])) {
        amount = parseChatAmount(literal[0]);
        description = `${clause.slice(0, literal.index)} ${after}`;
      }
    }
    description = description.replace(/^(?:(?:aku|saya|i)\s+)?(?:(?:dah|baru|just|telah)\s+)?(?:beli|bayar|paid|bought|pergi)\b\s*/i, "")
      .replace(/^(?:(?:aku|saya|i)\s+)/i, "").replace(/^\s*(?:untuk|for)\s+/i, "")
      .replace(/\s+(?:pada|on|untuk|for)\s*$/i, "").replace(/\s+/g, " ").trim().replace(/^[,.:!\s]+|[,.:!\s]+$/g, "");
    if (!description || description.length > 500 || /\d|\brm\b/i.test(description)) return unsupported();
    const expenseVerb = /\b(?:belanja|beli|bayar|spent|paid|bought)\b/i.test(part);
    const type = !expenseVerb && incomeWords.test(part) ? "INCOME" : "EXPENSE";
    const categoryId = inferCategory(description, type, categories) ?? (type === "INCOME" && /\b(?:dapat|terima|received)\b/i.test(description) ? categories.find((item) => item.name === "Lain-lain" && item.transactionType === "INCOME")?.id : undefined);
    if (!literal && !categoryId && !incomeWords.test(part) && !expenseVerb) return unsupported();
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
    const amount = parseChatAmount(reply.trim().replace(/^(?:rasanya|dalam|lebih kurang|harganya|harga|jumlahnya|total)\s+/i, "").replace(/\s+(?:je|saja|sahaja)$/i, ""));
    if (!amount) return null;
    item.amount = amount;
  } else if (state.field === "date") {
    try { item.occurredOn = resolveTransactionDate(reply.trim()); } catch { return null; }
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
