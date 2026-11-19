import { matchCategory } from "@/lib/ai/interpret";
import { shiftMonth, todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { monthSchema } from "@/lib/finance/validation";
import type { TelegramCategory } from "./parser";
import type { FinanceMutation, NotificationSettings } from "./schemas";
import { parseChatAmount, sensitiveInput } from "./text";

const ordinals = ["pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh", "kelapan", "kesembilan", "kesepuluh"];
export const weekdayNames = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu", "Ahad"];
export function recordReference(text: string) {
  const match = /^(?:(bil|transaksi|catatan)\s+)?(?:yang\s+)?(?:no(?:mbor)?\.?\s*)?(ke[- ]?\d{1,2}|\d{1,2}|pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kelapan|kesembilan|kesepuluh|tadi|tu|itu|ini|ni|tersebut)[.!?]*$/i.exec(text.trim());
  if (!match) return null;
  const value = match[2].toLowerCase();
  const ordinal = ordinals.indexOf(value);
  const index = /\d/.test(value) ? Number(value.replace(/^ke[- ]?/, "")) - 1 : ordinal >= 0 ? ordinal : null;
  const kind = match[1] ? match[1].toLowerCase() === "bil" ? "bill" as const : "transaction" as const : null;
  return { kind, index };
}

export function parseLedgerChange(text: string) {
  const edit = /^(?:tukar|ubah|edit)\s+(.+?)\s+(?:kepada|jadi|ke|to)\s+(.+)$/i.exec(text);
  const undo = /^(?:undo|batalkan catatan|padam transaksi)\s+(.+)$/i.exec(text);
  if (!edit && !undo) return null;
  const rawTarget = (edit?.[1] ?? undo![1]).trim().replace(/[.!?]+$/, "");
  const amount = edit ? parseChatAmount(edit[2]) : undefined;
  if (!rawTarget || rawTarget.length > 100 || sensitiveInput.test(rawTarget) || (edit && !amount) || /[?？]/.test(text)) {
    return { error: "Cuba ‘Tukar KFC tadi kepada RM25’ atau ‘Undo catatan terakhir’." };
  }
  const reference = recordReference(rawTarget);
  const last = /^(?:catatan |transaksi )?(?:terakhir|last)$/i.test(rawTarget);
  const today = !reference && /\s+tadi$/i.test(rawTarget);
  const name = rawTarget.replace(/^(?:catatan|transaksi)\s+/i, "").replace(/\s+tadi$/i, "");
  return { reference, last, today, name, change: { mode: edit ? "edit" as const : "undo" as const, amount } };
}

export function parseBudgetChange(text: string, categories: TelegramCategory[], now: Date) {
  const match = /^(?:(?:tetapkan|set|ubah|tukar|tambah)\s+)?bajet\s+(.+?)\s+(?:(bulan (?:depan|ini|ni|lepas)|\d{4}-\d{2})\s+)?(?:kepada\s+|jadi\s+)?((?:rm\s*[+-]?\s*\d|\d).*)$/i.exec(text);
  if (!match || /[?？]/.test(text)) return null;
  const period = match[2]?.toLowerCase();
  const current = todayInMalaysia(now).slice(0, 7);
  const month = !period || /ini|\bni$/.test(period) ? current
    : period === "bulan depan" ? shiftMonth(current, 1) : period === "bulan lepas" ? shiftMonth(current, -1) : period;
  const category = matchCategory(match[1], categories, "EXPENSE");
  const amount = parseChatAmount(match[3]);
  if (!category || !amount || !monthSchema.safeParse(month).success) {
    const names = categories.filter((item) => item.transactionType === "EXPENSE").slice(0, 12).map((item) => item.name);
    return { error: `Pilih nama kategori belanja dan amaun yang sah. Contoh ‘Bajet makan bulan depan RM400’.\nKategori: ${names.join(", ") || "tambah kategori dalam DuitFlow dahulu"}.` };
  }
  return { category, amount, month };
}

export const notificationHelp = "Tetapan Telegram\n• /peringatan bil 3 — ingatkan sehingga 3 hari sebelum matang (0–30)\n• /peringatan bajet 80 — ingatkan apabila belanja capai 80% had (1–100)\n• /peringatan bil off · /peringatan bajet off · /peringatan off\n• /mingguan Isnin — ringkasan pada hari pilihan, sekitar 9–10 pagi waktu Malaysia\n• /mingguan off — hentikan ringkasan";

export function describeNotifications(settings: NotificationSettings) {
  return [
    `Bil: ${settings.billReminderDays === null ? "mati" : settings.billReminderDays === 0 ? "hari matang" : `${settings.billReminderDays} hari sebelum matang`}`,
    `Bajet: ${settings.budgetReminderPercent === null ? "mati" : `${settings.budgetReminderPercent}% daripada had`}`,
    `Ringkasan: ${settings.weeklyDigestDay === null ? "mati" : weekdayNames[settings.weeklyDigestDay - 1]}`,
  ].join("\n");
}

export function notificationChange(command: string, input: string) {
  const value = input.trim().toLowerCase();
  if (command === "mingguan") {
    const day = weekdayNames.findIndex((name) => name.toLowerCase() === value) + 1;
    if (value === "off" || day) return { weeklyDigestDay: day || null };
  } else {
    if (value === "off") return { billReminderDays: null, budgetReminderPercent: null };
    const match = /^(bil|bajet)\s+(off|\d{1,3})$/.exec(value);
    if (match) {
      const amount = match[2] === "off" ? null : Number(match[2]);
      if (match[1] === "bil" && (amount === null || amount <= 30)) return { billReminderDays: amount };
      if (match[1] === "bajet" && (amount === null || (amount >= 1 && amount <= 100))) return { budgetReminderPercent: amount };
    }
  }
  return null;
}

export function describeFinanceMutation(proposal: FinanceMutation) {
  if (proposal.operation === "set_budget") {
    const before = proposal.previous ? formatMyr(proposal.previous.amount) : "belum ditetapkan";
    return `Bajet ${proposal.categoryName} · ${proposal.period}\nHad lama: ${before}\nHad baharu: ${formatMyr(proposal.amount)}`;
  }
  if (proposal.operation === "set_notifications") {
    return `Tetapan lama\n${describeNotifications(proposal.previous)}\n\nTetapan baharu\n${describeNotifications(proposal.next)}`;
  }
  const { record, change, restore } = proposal;
  const details = `${record.description} · ${record.categoryName} · ${record.occurredOn} · ${record.type === "EXPENSE" ? "belanja" : "pendapatan"}`;
  return change.mode === "edit"
    ? `Ubah amaun transaksi\n${details}\n${formatMyr(record.amount)} → ${formatMyr(change.amount!)}`
    : `Padam transaksi\n${details} · ${formatMyr(record.amount)}${restore ? `\nBil ${restore.name} akan dibuka semula untuk tarikh ${restore.dueOn}.` : ""}`;
}
