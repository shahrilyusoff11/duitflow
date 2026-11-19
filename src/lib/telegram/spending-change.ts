import "server-only";
import { getDatabase } from "@/lib/db";
import { monthRange, parseDate, shiftMonth, todayInMalaysia } from "@/lib/finance/dates";
import { Decimal, formatMyr } from "@/lib/finance/money";
import { authorizeTelegram } from "./access";

export function asksWhySpendingChanged(text: string) {
  return /^(?:kenapa|mengapa|why)\b/i.test(text) && /\b(?:belanja|perbelanjaan|spending|expenses)\b/i.test(text)
    && /\b(?:naik|tinggi|meningkat|turun|berkurang|higher|increase|decrease|up|down)\b/i.test(text);
}

export async function explainSpendingChange(userId: string, sender: string, now = new Date()) {
  const today = todayInMalaysia(now);
  const month = today.slice(0, 7);
  const previousMonth = shiftMonth(month, -1);
  if (previousMonth < "2000-01") return { text: "Tiada bulan sebelumnya untuk dibandingkan.", ids: [] };
  const current = monthRange(month);
  const previous = monthRange(previousMonth);
  const lastPrevious = new Date(previous.end);
  lastPrevious.setUTCDate(0);
  const days = Math.min(parseDate(today).getUTCDate(), lastPrevious.getUTCDate());
  const through = (value: Date) => value.toISOString().slice(0, 10);
  const range = (start: Date) => {
    const end = new Date(start);
    end.setUTCDate(days + 1);
    return { gte: start, lt: end };
  };
  const where = { userId, type: "EXPENSE" as const };
  return getDatabase().$transaction(async (tx) => {
    await authorizeTelegram(tx, userId, sender);
    const first = await tx.transaction.groupBy({ by: ["categoryId"], where: { ...where, occurredOn: range(current.start) }, _sum: { amount: true } });
    const second = await tx.transaction.groupBy({ by: ["categoryId"], where: { ...where, occurredOn: range(previous.start) }, _sum: { amount: true } });
    const zero = new Decimal(0);
    const latest = new Map(first.map((row) => [row.categoryId, row._sum.amount ?? zero]));
    const before = new Map(second.map((row) => [row.categoryId, row._sum.amount ?? zero]));
    const total = [...latest.values()].reduce((sum, amount) => sum.plus(amount), zero);
    const oldTotal = [...before.values()].reduce((sum, amount) => sum.plus(amount), zero);
    const delta = total.minus(oldTotal);
    const contributors = [...new Set([...latest.keys(), ...before.keys()])].map((id) => ({
      id, amount: latest.get(id) ?? zero, old: before.get(id) ?? zero,
    })).map((item) => ({ ...item, change: item.amount.minus(item.old) }))
      .filter((item) => delta.isZero() ? !item.change.isZero() : item.change.cmp(0) === delta.cmp(0))
      .sort((a, b) => b.change.abs().cmp(a.change.abs()) || a.id.localeCompare(b.id)).slice(0, 3);
    const categories = await tx.category.findMany({ where: { userId, id: { in: contributors.map((item) => item.id) } }, select: { id: true, name: true } });
    const names = new Map(categories.map((item) => [item.id, item.name]));
    const isDecrease = delta.isNegative();
    const examples = await tx.transaction.findMany({
      where: { ...where, categoryId: { in: contributors.map((item) => item.id) }, occurredOn: range(isDecrease ? previous.start : current.start) },
      orderBy: [{ amount: "desc" }, { occurredOn: "desc" }, { id: "asc" }], take: 5,
      select: { id: true, description: true, amount: true, occurredOn: true, categoryId: true },
    });
    const money = (amount: Decimal) => formatMyr(amount.toFixed(2));
    const change = delta.isZero() ? "Jumlah belanja sama." : `Belanja ${isDecrease ? "turun" : "naik"} ${money(delta.abs())}.`;
    const rows = [
      "Belanja direkod · tempoh sepadan",
      `${through(current.start)} hingga ${month}-${String(days).padStart(2, "0")}: ${money(total)}`,
      `${through(previous.start)} hingga ${previousMonth}-${String(days).padStart(2, "0")}: ${money(oldTotal)}`, change,
    ];
    if (contributors.length) rows.push("Kategori yang paling menyumbang kepada perubahan:",
      ...contributors.map((item) => `• ${names.get(item.id)}: ${money(item.old)} → ${money(item.amount)} (${item.change.isNegative() ? "−" : "+"}${money(item.change.abs())})`));
    if (examples.length) rows.push(isDecrease ? "Contoh transaksi daripada tempoh sebelumnya:" : "Contoh transaksi daripada tempoh semasa:",
      ...examples.map((item, index) => `${index + 1}. ${item.description} · ${names.get(item.categoryId)} · ${money(item.amount)} · ${through(item.occurredOn)}`));
    if (contributors.length) rows.push(`Cadangan semakan: Semak transaksi ${names.get(contributors[0].id)} dan asingkan bil wajib daripada belian yang boleh ditangguh.`);
    if (!first.length || !second.length) rows.push("Sekurang-kurangnya satu tempoh tiada belanja direkod.");
    return { text: rows.join("\n"), ids: examples.map((item) => item.id) };
  }, { isolationLevel: "RepeatableRead" });
}
