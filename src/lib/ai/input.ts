import { defaultCategories } from "@/lib/finance/default-categories";
import { chatMoneyPattern, financeDiscussion, findChatAmounts, incomeWords, leadingTransactionDate, parseChatAmount, plannedWrite, sensitiveInput, splitPurchases, unsupportedWrite } from "@/lib/telegram/text";

const unsupportedIntent = /[?？]|\b(?:berapa|baki|balance|budget|bajet|report|laporan|transactions|transaksi|delete|padam|edit|ubah|transfer|pindah|refund|abaikan|ignore|instructions|confirmation|pengesahan|select|insert|update|drop)\b/i;
const purchase = /\b(beli|belanja|buy|bought|paid|pay|bayar|spent|expense|bil|bill|cost)\b/i;
const commonWords = new Set(
  ("makan makanan minum minuman nasi ayam sarapan lunch dinner breakfast brunch coffee kopi tea teh groceries barang dapur rumah household " +
   "petrol minyak diesel tol toll parking grab bas bus train transport fuel bil utiliti utilities elektrik electricity water air internet sewa rent telefon phone " +
   "ubat klinik hospital doktor health clinic medicine pharmacy wayang pawagam hiburan cinema movie karaoke kfc buku book books school sekolah " +
   "gaji salary pendapatan income bonus komisen freelance commission dividen dividend upah " +
   "beli belanja buy bought paid pay bayar spent expense bill cost").split(" "),
);
export const genericCategoryNames = [...new Set(defaultCategories.map((item) => item.name))];
const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|hari\s+ini|harini|hari\s+ni|today|tadi|semalam|yesterday|kelmarin|minggu lepas|last week|esok|tomorrow|minggu depan|next week|bulan lepas|last month|hari tu|the other day)\b/gi;

export type SourceItem = {
  description: string;
  type: "INCOME" | "EXPENSE";
  amount?: string;
  dateExpression: string | null;
};

export function isAiProjection(message: string): boolean {
  const lines = message.split("\n");
  return lines.length <= 10 && lines.every((line, index) => {
    const match = /^Item (\d+): (?:INCOME|EXPENSE); ([a-z]+(?: [a-z]+)*)$/.exec(line);
    return !!match && match[1] === String(index + 1) && match[2].split(" ").every((word) => commonWords.has(word));
  });
}

export function prepareAiInput(text: string): { message: string; items: SourceItem[] } | null {
  if (!text.trim() || text.length > 4000) return null;
  const withoutIsoDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  if (sensitiveInput.test(withoutIsoDates) || unsupportedIntent.test(text) || unsupportedWrite.test(text) || plannedWrite.test(text) || financeDiscussion.test(text) || text.trimStart().startsWith("/")) return null;
  const parts = splitPurchases(text);
  if (!parts.length || parts.length > 10) return null;
  const inheritedDate = leadingTransactionDate(parts[0]);
  const projected: string[] = [];
  const items: SourceItem[] = [];
  for (const [index, part] of parts.entries()) {
    const dates = [...part.matchAll(datePattern)];
    const withoutDates = part.replace(datePattern, " ");
    const amounts = findChatAmounts(withoutDates.trim());
    // More than one numeric candidate in a clause needs an explicit amount.
    const match = amounts[0];
    const amount = amounts.length === 1 && (/(?:rm|ringgit|sen|k\b)/i.test(match[0]) || !withoutDates.trim().slice(match.index + match[0].length).trim()) ? parseChatAmount(match[0]) : undefined;
    const description = withoutDates.trim().replace(chatMoneyPattern, " ").replace(/^(?:dan|and|beli|bayar|paid|bought)\s+/i, "").replace(/\s+/g, " ").trim().replace(/[,.]+$/, "").trim();
    if (!description || description.length > 500 || (incomeWords.test(part) && purchase.test(part))) return null;
    const words = [...description.toLowerCase().matchAll(/[a-z]+/g)].map(([word]) => word).filter((word) => commonWords.has(word));
    if (words.length === 0) return null;
    const type = incomeWords.test(part) ? "INCOME" : "EXPENSE";
    const dateExpression = dates.length === 0 ? inheritedDate ?? "today" : dates.length === 1 ? dates[0][0] : null;
    items.push({ description, type, amount, dateExpression });
    // Only vocabulary owned by the app crosses the boundary. Numeric values,
    // dates, user-authored descriptions and unmatched names stay local.
    projected.push(`Item ${index + 1}: ${type}; ${[...new Set(words)].join(" ")}`);
  }
  return { message: projected.join("\n"), items };
}
