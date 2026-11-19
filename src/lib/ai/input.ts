import { defaultCategories } from "@/lib/finance/default-categories";
import type { TelegramCategory } from "@/lib/telegram/parser";
import { chatMoneyPattern, financeDiscussion, findChatAmounts, incomeWords, leadingTransactionDate, parseChatAmount, plannedWrite, sensitiveInput, splitPurchases, transactionDatePattern, unsupportedWrite } from "@/lib/telegram/text";

const instructionWords = /\b(?:abaikan|ignore|instructions|confirmation|pengesahan|select|insert|update|drop|someone else|orang lain)\b/i;
const unsupportedTransaction = /[?？]|\b(?:berapa|baki|balance|budget|bajet|report|laporan|transactions|transaksi|bocor|mana|kategori|how much|how many|what|which|where|show|list|status|bil|bill|ansuran|installment)\b/i;
const purchase = /\b(beli|belanja|buy|bought|paid|pay|bayar|spent|expense|bil|bill|cost)\b/i;
const commonWords = new Set(
  ("makan makanan minum minuman nasi ayam sarapan lunch dinner breakfast brunch coffee kopi tea teh groceries barang dapur rumah household " +
   "petrol minyak diesel tol toll parking grab bas bus train transport fuel bil utiliti utilities elektrik electricity water air internet sewa rent telefon phone " +
   "ubat klinik hospital doktor health clinic medicine pharmacy wayang pawagam hiburan cinema movie karaoke kfc buku book books school sekolah " +
   "gaji salary pendapatan income bonus komisen freelance commission dividen dividend upah " +
   "beli belanja buy bought paid pay bayar dibayar spent expense expenses bill bills cost charged settled settle spend spending outgoings " +
   "ansuran installment installments instalment instalments tunggakan tertunggak overdue due next terdekat seterusnya paling dekat upcoming coming " +
   "kategori category categories breakdown pecahan split report laporan ringkasan summary analisis analisa analyse analyze review trend semak cek check " +
   "transaksi transaction transactions catatan entry entries recent latest last terkini terbaharu terakhir rekod catat record log track saved " +
   "bajet budget limit had balance net baki bersih left remaining berbaki over under within mampu afford terlebih naik turun increase drop higher lower " +
   "bocor leak leaking leaked duit wang money cash pocket drain draining pergi went go lari keluar habis banyak terbesar tertinggi top biggest largest " +
   "heaviest highest bulk chunk most main major majority urutan rank total jumlah perbelanjaan masuk dapat terima credited received earn earned " +
   "suggest cadangan tips jimat berjimat save savings kurangkan cut reduce banding compare compared versus " +
   "bulan month months minggu week weeks hari day days year tahun daily weekly monthly tahunan yearly depan lepas lalu sebelumnya previous prior " +
   "tadi earlier above tu itu ni ini tersebut that those one first second third fourth fifth pertama kedua ketiga keempat kelima yang yg nombor number " +
   "dah sudah telah baru selesai just already yet belum tak tidak bukan not never didn't haven't wasn't isn't nak mahu akan will want plan planned " +
   "aku saya ku kita i i'm i've my mine we our us you your awak anda gua dia sendiri me the a an to for in on at from with by of as and or then " +
   "kalau jika if pula pulak instead about same sama lagi semula juga pun plus kat dekat ke macam bagaimana bila apa mana siapa berapa berapakah " +
   "how much many what what's where which why kenapa sebab please tolong boleh patut should could can did do does doing is was were are be am have has would " +
   "bagi beri tunjuk tunjukkan show list tell give bring pull see senarai ada kena perlu sekadar je sahaja saja lah weh eh kan betul status " +
   "semuanya semua overall full ikut mengikut across until since sejak pasal tentang sebenarnya really roughly approximately around took stretch " +
   "dua tiga empat lima enam tujuh lapan sembilan sepuluh two three four five six seven eight nine ten dahpun done marked mark cleared complete").split(" "),
);
export const genericCategoryNames = [...new Set(defaultCategories.map((item) => item.name))];
const monthPattern = /\b(?:\d{4}-\d{2}(?![-\d])|bulan (?:(?:yang|yg)\s+)?(?:ini|ni|lepas|lalu|sebelumnya|depan)|(?:this|last|previous|prior|next) month)\b/gi;
export const referencePattern = /\[(?:NAME|AMOUNT|NUMBER|DATE|MONTH)_[1-9]\d{0,2}\]/;
const safePunctuation = /^[\s,.!?:;&]+$/;
const word = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/u;
const explicitAmount = /^(?:[+\-−]?\s*)rm\s*|(?:ringgit|sen|k)$/i;
type ReferenceKind = "NAME" | "AMOUNT" | "NUMBER" | "DATE" | "MONTH";
type Reference = { kind: ReferenceKind; text: string };

export type SourceItem = {
  description: string;
  type: "INCOME" | "EXPENSE";
  amount?: string;
  dateExpression: string | null;
};

export function isAiProjection(message: string): boolean {
  const tokens = message.matchAll(new RegExp(referencePattern.source + "|" + word.source + "|.", "gsu"));
  return [...tokens].every(([token]) =>
    referencePattern.test(token) || commonWords.has(token.toLowerCase()) || safePunctuation.test(token));
}

function transactionItems(text: string, parts: string[]): SourceItem[] {
  if (unsupportedTransaction.test(text) || plannedWrite.test(text) || financeDiscussion.test(text) || parts.length > 10) return [];
  const inheritedDate = leadingTransactionDate(parts[0]);
  const items: SourceItem[] = [];
  for (const part of parts) {
    const dates = [...part.matchAll(transactionDatePattern)];
    const withoutDates = part.replace(transactionDatePattern, " ");
    const amounts = findChatAmounts(withoutDates.trim());
    // More than one numeric candidate in a clause needs an explicit amount.
    const match = amounts[0];
    const amount = amounts.length === 1 && (/(?:rm|ringgit|sen|k\b)/i.test(match[0]) || !withoutDates.trim().slice(match.index + match[0].length).trim()) ? parseChatAmount(match[0]) : undefined;
    const description = withoutDates.trim().replace(chatMoneyPattern, " ").replace(/^(?:dan|and|beli|bayar|paid|bought)\s+/i, "").replace(/\s+/g, " ").trim().replace(/[,.]+$/, "").trim();
    if (!description || description.length > 500 || (incomeWords.test(part) && purchase.test(part)) ||
        (!amounts.length && !purchase.test(part) && !incomeWords.test(part))) return [];
    const type = incomeWords.test(part) ? "INCOME" : "EXPENSE";
    const dateExpression = dates.length === 0 ? inheritedDate ?? "today" : dates.length === 1 ? dates[0][0] : null;
    items.push({ description, type, amount, dateExpression });
  }
  return items;
}

export function prepareAiInput(text: string, categories: TelegramCategory[] = []) {
  if (!text.trim() || text.length > 4000 || text.trimStart().startsWith("/")) return null;
  const withoutIsoDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  if (sensitiveInput.test(withoutIsoDates) || instructionWords.test(text) || unsupportedWrite.test(text)) return null;
  const categoryNames = [...new Set(categories.map((category) => category.name))]
    .filter((name) => !genericCategoryNames.some((generic) => generic === name))
    .sort((a, b) => b.length - a.length)
    .map((name) => "(?<![\\p{L}\\p{N}_])" + name.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}_])");
  const tokens = new RegExp([
    "(?<contextWord>(?<=\\byang )tadi\\b)",
    "(?<month>" + monthPattern.source + ")", "(?<date>" + transactionDatePattern.source + ")",
    "(?<number>" + chatMoneyPattern.source + ")",
    ...(categoryNames.length ? ["(?<category>" + categoryNames.join("|") + ")"] : []),
    "(?<word>" + word.source + ")", "(?<punctuation>[,.!?:;&])", "\\s+", ".",
  ].join("|"), "gisu");
  const parts = splitPurchases(text);
  const items = transactionItems(text, parts);
  const references = new Map<string, Reference>();
  let hasWords = false;
  const projected = (items.length > 1 ? parts : [text]).map((part) => {
    let line = "";
    let unknown = "";
    const slot = (kind: ReferenceKind, text: string) => {
      const key = "[" + kind + "_" + (references.size + 1) + "]";
      references.set(key, { kind, text });
      line += key;
    };
    const flushUnknown = () => {
      if (!unknown) return;
      slot("NAME", unknown.trimEnd());
      line += unknown.slice(unknown.trimEnd().length);
      unknown = "";
    };
    for (const match of part.matchAll(tokens)) {
      const [token] = match;
      const groups = match.groups!;
      const safeWord = groups.word && commonWords.has(token.toLowerCase().replace("’", "'"));
      if (groups.word && !safeWord) { unknown += token; continue; }
      if (!token.trim() && unknown) { unknown += token; continue; }
      flushUnknown();
      if (groups.month) slot("MONTH", token);
      else if (groups.date) slot("DATE", token);
      else if (groups.number) slot(explicitAmount.test(token) ? "AMOUNT" : "NUMBER", token);
      else if (groups.category) slot("NAME", token);
      else if (safeWord || groups.contextWord) {
        hasWords = true;
        line += token.replace("’", "'");
      } else if (groups.punctuation || !token.trim()) line += token;
      else line += " ";
    }
    flushUnknown();
    return line.trim();
  });
  const message = projected.join("\n");
  return hasWords && message.length <= 4000 && references.size <= 999 ? { message, items, references } : null;
}
