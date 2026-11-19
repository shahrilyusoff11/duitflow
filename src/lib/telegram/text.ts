import { parseMoney } from "@/lib/finance/money";

export const chatMoneyPattern = /(?<![\p{L}\p{N}.,])(?:[+\-−‐-―﹣－➖]\s*)?(?:rm\s*)?(?:[+\-−‐-―﹣－➖]\s*)?\d[\d.,]*(?:k|\s+ringgit(?:\s+\d[\d.,]*\s+sen)?|\s+sen)?(?![\p{L}\p{N}.,])/giu;
const explicitCurrency = /(?:rm|k\b|ringgit|sen)/i;
export const unsupportedWrite = /\b(?:abaikan|ignore|select|delete|insert|update|kemas\s?kini|padam|edit|ubah|refund|transfer|pindah|jangan|batal|tanpa pengesahan|skip confirmation)\b/i;
export const sensitiveInput = /[@]|https?:\/\/|\b(?:www\.|password|passcode|kata laluan|pin|otp|cvv|cvc|seed phrase|private key|api key|token|bearer|bank|akaun|account number|no\.?\s+kad|card number|passport|mykad|telefon|phone|swift|iban|ssn)\b|\d(?:[\s-]?\d){6,}/iu;
export const incomeWords = /\b(?:gaji|salary|pendapatan|income|bonus|komisen|freelance|commission|dividen|dividend|upah|duit poket|wang saku|pocket money|elaun|allowance|(?:dapat|terima|received)\s+(?:duit|wang|money|rm\s*\d+))\b/i;
export const plannedWrite = /\b(?:belum|tak|tidak|bukan|nak|mahu|akan|kena|perlu|kalau|jika|if|maybe|want|need|will|owe|plan|scheduled|to pay|not|never|didn['’]t|haven['’]t|hasn['’]t)\b/i;
export const financeDiscussion = /\b(?:analisis|analisa|analyse|analyze|trend|cadangan\s+(?:belanja|kewangan)|(?:boleh|patut|mampu|can i|should i)\b.*\b(?:belanja|beli|bayar|spend|buy|pay))\b/i;
export const transactionDatePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|hari\s+ini|harini|hari\s+ni|today|tadi|semalam|yesterday|kelmarin|minggu lepas|last week|esok|tomorrow|minggu depan|next week|bulan lepas|last month|hari tu|the other day|(?:last|next|on)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:isnin|selasa|rabu|khamis|jumaat|sabtu|ahad)\s+(?:lepas|depan))\b/gi;
export const leadingTransactionDate = (text: string) => [...text.matchAll(transactionDatePattern)].find((date) => date.index === 0)?.[0];

export function parseChatAmount(text: string) {
  try { return parseMoney(text.trim().replace(/[.,!?]$/, "")).toFixed(2); }
  catch { return undefined; }
}

export function findChatAmounts(text: string) {
  return [...text.matchAll(chatMoneyPattern)];
}

// A conjunction can also join items in one purchase ("nasi dan ayam RM12").
// Split a soft separator only once there is an amount in the left-hand clause.
export function splitPurchases(text: string) {
  return text.split(/\s+(?:lepas\s+tu|pastu|kemudian|then)\s+|[;\n]+/i).flatMap((part) => {
    const clauses = [];
    let start = 0;
    for (const match of part.matchAll(/\s*,\s+(?:(?:dan|and)\s+)?|\s+(?:dan|and|\+)\s+/gi)) {
      const left = part.slice(start, match.index);
      const withoutDates = left.replace(transactionDatePattern, " ");
      const right = part.slice(match.index + match[0].length).replace(transactionDatePattern, " ");
      if (!findChatAmounts(withoutDates).some((amount) => !withoutDates.slice(amount.index + amount[0].length).trim() ||
        (explicitCurrency.test(amount[0]) && findChatAmounts(right).length))) continue;
      clauses.push(left);
      start = match.index + match[0].length;
    }
    clauses.push(part.slice(start));
    return clauses;
  }).map((part) => part.trim()).filter(Boolean);
}
