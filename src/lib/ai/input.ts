import { parseMoney } from "@/lib/finance/money";
import { defaultCategories } from "@/lib/finance/default-categories";

const privateInput = /[@]|https?:\/\/|\b(?:www\.|password|passcode|kata laluan|pin|otp|cvv|cvc|seed phrase|private key|api key|token|bearer|bank|akaun|account number|no\.?\s+kad|card number|passport|mykad|telefon|phone|swift|iban|ssn)\b|\d(?:[\s-]?\d){6,}/iu;
const unsupportedIntent = /[?？]|\b(?:berapa|baki|balance|budget|bajet|report|laporan|transactions|transaksi|delete|padam|edit|ubah|transfer|pindah|refund|abaikan|ignore|instructions|confirmation|pengesahan|select|insert|update|drop)\b/i;
const income = /\b(gaji|salary|pendapatan|income|bonus|komisen|freelance|commission|dividen|dividend|upah)\b/i;
const purchase = /\b(beli|belanja|buy|bought|paid|pay|bayar|spent|expense|bil|bill|cost)\b/i;
const commonWords = new Set(
  ("makan makanan minum minuman nasi ayam sarapan lunch dinner breakfast coffee kopi tea teh groceries barang dapur rumah household " +
   "petrol minyak diesel tol toll parking grab bas bus train transport fuel bil utiliti utilities elektrik electricity water air internet sewa rent telefon phone " +
   "ubat klinik hospital doktor health clinic medicine pharmacy wayang pawagam hiburan cinema movie buku book books school sekolah " +
   "gaji salary pendapatan income bonus komisen freelance commission dividen dividend upah " +
   "beli belanja buy bought paid pay bayar spent expense bill cost").split(" "),
);
export const genericCategoryNames = [...new Set(defaultCategories.map((item) => item.name))];
const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|hari ini|today|semalam|yesterday|kelmarin|minggu lepas|last week|esok|tomorrow|minggu depan|next week|bulan lepas|last month|hari tu|the other day)\b/gi;
const moneyPattern = /(?<![\p{L}\p{N}.,])(?:[+\-−‐-―﹣－➖]\s*)?(?:rm\s*)?(?:[+\-−‐-―﹣－➖]\s*)?\d[\d.,]*(?:k|\s+ringgit(?:\s+\d[\d.,]*\s+sen)?|\s+sen)?(?![\p{L}\p{N}.,])/giu;

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
  if (privateInput.test(withoutIsoDates) || unsupportedIntent.test(text) || text.trimStart().startsWith("/")) return null;
  const parts = text.split(/\s+(?:lepas tu|kemudian|then|dan|and)\s+|[;\n]+|,\s+(?=[\p{L}])/iu).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 10) return null;
  const projected: string[] = [];
  const items: SourceItem[] = [];
  for (const [index, part] of parts.entries()) {
    const dates = [...part.matchAll(datePattern)];
    const withoutDates = part.replace(datePattern, " ");
    const amounts = [...withoutDates.matchAll(moneyPattern)];
    // More than one numeric candidate in a clause needs an explicit amount.
    let amount: string | undefined;
    if (amounts.length === 1) {
      const literal = amounts[0][0].trim().replace(/[.,]+$/, "");
      try { amount = parseMoney(literal).toFixed(2); } catch { /* Leave it for clarification. */ }
    }
    const description = withoutDates.replace(moneyPattern, " ").replace(/^(?:tadi\s+)?(?:dan|and|beli|bayar|paid|bought)\s+/i, "").replace(/\s+/g, " ").trim().replace(/[,.]+$/, "").trim();
    if (!description || description.length > 500 || (income.test(description) && purchase.test(description))) return null;
    const words = [...description.toLowerCase().matchAll(/[a-z]+/g)].map(([word]) => word).filter((word) => commonWords.has(word));
    if (words.length === 0) return null;
    const type = income.test(description) ? "INCOME" : "EXPENSE";
    const dateExpression = dates.length === 0 ? "today" : dates.length === 1 ? dates[0][0].toLowerCase() : null;
    items.push({ description, type, amount, dateExpression });
    // Only vocabulary owned by the app crosses the boundary. Numeric values,
    // dates, user-authored descriptions and unmatched names stay local.
    projected.push(`Item ${index + 1}: ${type}; ${[...new Set(words)].join(" ")}`);
  }
  return { message: projected.join("\n"), items };
}
