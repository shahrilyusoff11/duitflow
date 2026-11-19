import { parseDate, todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { billScheduleLabel } from "@/lib/finance/bill-schedule";
import type { TelegramCategory } from "./parser";
import { billDraftSchema, billProposalSchema, type BillDraft, type BillPaymentDraft, type BillProposal } from "./schemas";
import { findChatAmounts, parseChatAmount, unsupportedWrite } from "./text";

const cadencePattern = /\b(?:setiap bulan|tiap(?:-tiap)? bulan|sebulan|bulanan|monthly|setiap tahun|tiap(?:-tiap)? tahun|tahunan|yearly)\b/i;
const duePattern = /\b(?:\d{4}-\d{2}-\d{2}|harini|hari ni|hari ini|today|esok|tomorrow|semalam|yesterday)\b/i;
const billPrefix = /^(?:(?:aku|saya)\s+)?(?:(?:catat|tambah|simpan|rekod|ada|kena bayar|perlu bayar|nak bayar|belum bayar)\s+)?(?:bil|ansuran)\b\s*/i;
const paidPrefix = /^(?:(?:aku|saya)\s+)?(?:dah|sudah|telah|baru|selesai)\s+bayar\s+(?:bil|ansuran)\b\s*/i;
const paidStatus = /^(?:(?:update|kemas\s?kini|tandakan|tanda)\s+)?bil(?:\s+(.+?))?\s+(?:dah|sudah|telah)\s+(?:dibayar|bayar)\b(.*)$/i;
const billReference = /^(?:ni|ini|tu|itu|tadi|tersebut)$/i;
const oncePattern = /\b(?:sekali(?:\s+(?:bayar|sahaja|saja|je))?|one[- ]off)\b/i;
const countPattern = /\b(?:untuk\s+|selama\s+)?(\d+)\s*(?:kali(?:\s+bayar(?:an)?)?|bayaran|ansuran|bulan)\b/i;
const endPattern = /\b(?:sampai|hingga|sehingga|tamat(?:\s+pada)?)\s+(\d{4}-\d{2}-\d{2})\b/i;
const lookupPrefix = /^(?:(?:bila|berapa)\s+(?:(?:aku|saya)\s+)?(?:(?:kena|perlu)\s+bayar\s+)?|(?:status|semak)\s+)(?:bil|ansuran)\b\s*/i;
const listPattern = /^(?:(?:apa|mana)\s+)?(?:bil(?:-bil)?\s+(?:apa\s+)?(?:(?:yang\s+)?(?:kena bayar|perlu dibayar|belum bayar|tertunggak)(?:\s+(?:apa|tak|ke))?|apa lagi)|(?:ada\s+)?bil(?:-bil)?\s+yang\s+akan datang|ada bil(?:\s+(?:kena bayar|belum bayar|tertunggak))?\s+(?:tak|ke)|(?:senarai|tunjuk)\s+bil(?: aku| saya)?)\s*[?.!]*$/i;
const nextBillPattern = /^(?:(?:(?:apa(?:kah)?|mana|bila|tunjuk(?:kan)?|semak|bagi|check)\s+)?bil(?:\s+(?:apa|mana|aku|saya|yang))*\s+(?:terdekat|seterusnya|paling\s+dekat)(?:\s+(?:kena bayar|perlu dibayar|apa|bila))?|(?:what(?:'s| is) (?:my|the) )?next bill)\s*[?.!？]*$/i;
const nextInstallmentPattern = /^(?:(?:bila|apa|mana|tunjuk(?:kan)?|semak)\s+)?ansuran\s+(?:seterusnya|terdekat)(?:\s+(?:apa|bila))?\s*[?.!？]*$/i;
const confidentialText = /@|https?:\/\/|\b(?:otp|kata laluan|password|cvv)\b/i;

type BillIntent =
  | { kind: "LIST" }
  | { kind: "NEXT"; installmentsOnly?: boolean }
  | { kind: "LOOKUP"; name: string }
  | { kind: "DRAFT"; bill: BillDraft }
  | { kind: "PAY"; name?: string; payment: BillPaymentDraft }
  | { kind: "MESSAGE"; message: string };

function resolveBillDate(text: string, now: Date, payment = false) {
  const value = text.toLowerCase();
  const offset = /^(?:esok|tomorrow)$/.test(value) ? 1 : /^(?:semalam|yesterday)$/.test(value) ? -1 : 0;
  if (payment && offset > 0) return undefined;
  try {
    const date = parseDate(/^\d/.test(value) ? value : todayInMalaysia(now));
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    parseDate(iso);
    return !payment || iso <= todayInMalaysia(now) ? iso : undefined;
  } catch { return undefined; }
}

function billCadence(text: string) { return /tahun|yearly/i.test(text) ? "YEARLY" : "MONTHLY"; }

function finiteSchedule(text: string) {
  const count = countPattern.exec(text);
  const end = endPattern.exec(text);
  const once = oncePattern.exec(text);
  const invalidCount = count && (!Number.isSafeInteger(Number(count[1])) || Number(count[1]) < 2 || Number(count[1]) > 1200);
  return {
    paymentLimit: once ? 1 : count ? Number(count[1]) : undefined,
    endsOn: end?.[1], invalid: Boolean(invalidCount || Number(Boolean(count)) + Number(Boolean(end)) + Number(Boolean(once)) > 1),
    rest: text.replace(countPattern, " ").replace(endPattern, " ").replace(oncePattern, " "),
  };
}

export function parseBillIntent(text: string, now: Date): BillIntent | null {
  const paid = paidPrefix.exec(text);
  const status = paidStatus.exec(text);
  const isPayment = Boolean(paid || status);
  const lookup = lookupPrefix.exec(text);
  const prefix = paid ?? lookup ?? billPrefix.exec(text);
  const list = listPattern.test(text);
  if (nextInstallmentPattern.test(text)) return { kind: "NEXT", installmentsOnly: true };
  if (nextBillPattern.test(text)) return { kind: "NEXT" };
  if (!prefix && !list && !status) return null;
  const details = status ? `${status[1] ?? ""} ${status[2]}`.trim() : text.slice(prefix?.[0].length ?? 0);
  if (unsupportedWrite.test(status ? details : text) || confidentialText.test(text)) {
    return { kind: "MESSAGE", message: "Untuk semak atau catat bil, hantar nama bil dan butirannya sahaja. Perubahan pada bil sedia ada boleh dibuat di DuitFlow." };
  }
  if (list) return { kind: "LIST" };
  const finite = finiteSchedule(isPayment ? "" : details);
  const scheduleText = isPayment ? details : finite.rest;
  const cadence = scheduleText.match(cadencePattern);
  const dates = [...scheduleText.matchAll(new RegExp(duePattern, "gi"))];
  const date = dates.length === 1 ? resolveBillDate(dates[0][0], now, isPayment) : undefined;
  const withoutDate = scheduleText.replace(new RegExp(duePattern, "gi"), " ").replace(cadencePattern, " ");
  if (/[;\n]|\b(?:dan|and)\s+(?:bil|bayar|beli|belanja)\b/i.test(withoutDate)) return { kind: "MESSAGE", message: "Hantar satu bil dalam satu mesej supaya saya boleh semak butiran setiap bil." };
  const numbered = isPayment ? /^(?:yang\s+(?:ke[- ]?)?|ke[- ]?)(\d{1,2})(?=\s|$)/i.exec(withoutDate.trim()) : null;
  const paymentDetails = numbered ? withoutDate.trim().slice(numbered[0].length) : withoutDate;
  const amounts = findChatAmounts(paymentDetails);
  const amount = amounts.length === 1 ? parseChatAmount(amounts[0][0]) : undefined;
  const name = paymentDetails.replace(/\b(?:kena bayar|perlu (?:di)?bayar|belum (?:di)?bayar|tarikh (?:akhir|mula)|due(?: date)?|bermula|mulai|pada|sebelum|bila|berapa)\b/gi, " ")
    .replace(amounts[0]?.[0] ?? "", "").replace(/\s+/g, " ").replace(/^[\s,.!?]+|[\s,.!?]+$/g, "");
  const parsed = billDraftSchema.safeParse({ name: name || undefined, amount, nextDueOn: date,
    cadence: cadence ? billCadence(cadence[0]) : finite.paymentLimit || finite.endsOn ? "MONTHLY" : undefined,
    paymentLimit: finite.paymentLimit, endsOn: finite.endsOn,
  });
  if (!parsed.success || finite.invalid || amounts.length > 1 || /\d|\brm\b/i.test(name)) {
    return { kind: "MESSAGE", message: "Semak nama, amaun dan tarikh jadual bil. Cuba ‘Bil ShopeePay RM30 setiap bulan, kena bayar esok’." };
  }
  if (isPayment) {
    if (/[?？]|\b(?:belum|tak|tidak|nak|akan|kalau|kena|bila|berapa|mana)\b/i.test(details) || (amounts.length && !amount) || (dates.length && !date)) return { kind: "MESSAGE", message: "Saya perlukan nama bil serta amaun dan tarikh bayaran yang sah jika dinyatakan. Contoh ‘Dah bayar bil ShopeePay RM30 semalam’." };
    if (numbered && name) return { kind: "MESSAGE", message: "Beritahu nombor bil dan amaun bayaran, contohnya ‘Dah bayar bil yang ke-2 RM30’." };
    return { kind: "PAY", name: numbered ? `yang ke-${numbered[1]}` : name || undefined, payment: { amount, occurredOn: date ?? todayInMalaysia(now) } };
  }
  if (lookup || /[?？]\s*$/.test(text) || /\b(?:bila|berapa)\b/i.test(details)) return name ? { kind: "LOOKUP", name } : { kind: "LIST" };
  return { kind: "DRAFT", bill: parsed.data };
}

export function readBillNameReply(text: string) {
  const reply = text.trim().replace(/[.!]$/, "");
  if (!reply || reply.startsWith("/") || /[?？]/.test(reply) || unsupportedWrite.test(reply) || confidentialText.test(reply) ||
    /^(?:aku|saya|i|makan|beli|belanja|bayar|dapat|terima|senarai|tunjuk|berapa|bila|ada|tambah|tolong|boleh|bagi|beri|show|how|what|status|top|jumlah)\b/i.test(reply) ||
    /\b(?:report|laporan|ringkasan)\b/i.test(reply) ||
    listPattern.test(reply) || nextBillPattern.test(reply) || paidPrefix.test(reply) || paidStatus.test(reply) || findChatAmounts(reply).length) return undefined;
  const name = billDraftSchema.shape.name.safeParse(reply.replace(/^(?:nama bil(?:nya)?|bil)\s+/i, "").replace(/\s+(?:kena|perlu) bayar$/i, ""));
  return name.success && name.data && !billReference.test(name.data) ? name.data : undefined;
}

export function missingBillField(bill: BillDraft) {
  if (!bill.name) return "name";
  if (!bill.amount) return "amount";
  if (!bill.nextDueOn) return "nextDueOn";
  if (!bill.cadence) return "cadence";
  if (!bill.categoryId) return "categoryId";
  return null;
}

export function billQuestion(bill: BillDraft, categories: TelegramCategory[]) {
  switch (missingBillField(bill)) {
    case "name": return "Bil apa yang perlu dibayar? Beritahu nama bil, contohnya ShopeePay.";
    case "amount": return `Berapa amaun bil ${bill.name}? Balas contohnya RM30.`;
    case "nextDueOn": return `Bila bil ${bill.name} perlu dibayar? Balas contohnya esok atau YYYY-MM-DD.`;
    case "cadence": return `Bil ${bill.name} ini bulanan atau tahunan? Balas ‘setiap bulan’, ‘setiap tahun’, ‘sekali bayar’, ‘6 kali bayar’ atau ‘hingga YYYY-MM-DD’.`;
    case "categoryId": return `Pilih kategori belanja untuk ${bill.name}. Balas nama kategori: ${categories.filter((item) => item.transactionType === "EXPENSE").slice(0, 20).map((item) => item.name).join(", ") || "tambah kategori di DuitFlow dahulu"}.`;
    default: return "Butiran bil sudah lengkap. Hantar semula untuk semak cadangan.";
  }
}

export function continueBillDraft(bill: BillDraft, text: string, categories: TelegramCategory[], now: Date): BillDraft | null {
  const reply = text.trim().replace(/[.!]$/, "");
  if (!reply || reply.startsWith("/") || /[?？]/.test(reply) || unsupportedWrite.test(reply)) return null;
  switch (missingBillField(bill)) {
    case "name": {
      const name = readBillNameReply(reply);
      return name ? { ...bill, name } : null;
    }
    case "amount": {
      const amount = parseChatAmount(reply.replace(/^(?:jumlahnya|amaun(?:nya)?|dalam)\s+/i, "").replace(/\s+(?:je|saja|sahaja)$/i, ""));
      return amount ? { ...bill, amount } : null;
    }
    case "nextDueOn": {
      const value = reply.replace(/^(?:kena bayar|perlu bayar|tarikh akhir|due|pada|bermula|mulai)\s+/i, "");
      const date = /^(?:\d{4}-\d{2}-\d{2}|harini|hari ni|hari ini|today|esok|tomorrow|semalam|yesterday)$/i.test(value) ? resolveBillDate(value, now) : undefined;
      const draft = billDraftSchema.safeParse({ ...bill, nextDueOn: date });
      return date && draft.success ? draft.data : null;
    }
    case "cadence": {
      const finite = finiteSchedule(reply);
      if (!finite.invalid && !finite.rest.trim() && (finite.paymentLimit || finite.endsOn)) {
        const result = billDraftSchema.safeParse({ ...bill, cadence: "MONTHLY", paymentLimit: finite.paymentLimit, endsOn: finite.endsOn });
        if (result.success) return result.data;
      }
      return new RegExp(`^${cadencePattern.source}(?:\$|\\s+(?:je|saja|sahaja)\$)`, "i").test(reply) ? { ...bill, cadence: billCadence(reply) } : null;
    }
    case "categoryId": {
      const category = categories.find((item) => item.transactionType === "EXPENSE" && item.name.toLowerCase() === reply.toLowerCase());
      return category ? { ...bill, categoryId: category.id } : null;
    }
    default: return null;
  }
}

export function prepareBillDraft(bill: BillDraft, categories: TelegramCategory[]) {
  const resolved = { ...bill, categoryId: bill.categoryId ?? categories.find((item) => item.transactionType === "EXPENSE" && item.name === "Bil & Utiliti")?.id };
  const proposal = billProposalSchema.safeParse({ operation: "create_bill", bill: resolved });
  return proposal.success
    ? { kind: "PROPOSAL" as const, payload: proposal.data }
    : { kind: "CLARIFICATION" as const, payload: { operation: "create_bill" as const, bill: resolved } };
}

export function describeBillProposal(proposal: BillProposal, categories: TelegramCategory[]) {
  if (proposal.operation === "pay_bill") {
    const after = proposal.scheduleAfter;
    const schedule = !after ? "Jadual bil akan bergerak ke tarikh seterusnya." : after.nextDueOn ? `Bil seterusnya pada ${after.nextDueOn}.` : "Jadual bil akan selesai.";
    return `Rekod bayaran bil ${proposal.name}\nBayaran ${formatMyr(proposal.payment.amount)} pada ${proposal.payment.occurredOn}\nBil untuk tarikh ${proposal.nextDueOn}. ${schedule}${after?.progress ? `\n${after.progress}` : ""}`;
  }
  const { bill } = proposal;
  const category = categories.find((item) => item.id === bill.categoryId);
  const schedule = billScheduleLabel({ ...bill, paymentLimit: bill.paymentLimit ?? null, endsOn: bill.endsOn ?? null, paymentsMade: 0 });
  return `Tambah bil ${bill.name}\n${formatMyr(bill.amount)} · ${schedule} · ${category?.name ?? "kategori tidak tersedia"}\nTarikh perlu dibayar ${bill.nextDueOn}.`;
}
