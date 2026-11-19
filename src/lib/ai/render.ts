import { Decimal, formatMyr } from "@/lib/finance/money";
import type { getTelegramReport, queryTelegramFinance } from "@/lib/telegram/dal";

export function renderMonthlyReport(report: Awaited<ReturnType<typeof getTelegramReport>>, month: string, view: "BALANCE" | "EXPENSE" | "FULL") {
  const base = `${month}\nPendapatan: ${formatMyr(report.income)}\nBelanja: ${formatMyr(report.expense)}\nBersih direkod (pendapatan − belanja): ${formatMyr(report.net)}`;
  if (view === "BALANCE") return base;
  const breakdown = report.breakdown.map((row) => `${row.categoryName}: ${formatMyr(row.amount)}`).join("\n") || "Tiada belanja.";
  if (view === "EXPENSE") {
    const label = report.breakdown.length === 10 ? "Kategori belanja teratas" : "Belanja mengikut kategori";
    return `Laporan perbelanjaan ${month}\nJumlah belanja: ${formatMyr(report.expense)}\n${label}\n${breakdown}`;
  }
  const recent = report.recent.map((row) => `${row.occurredOn} · ${row.description}: ${formatMyr(row.amount)} (${row.type === "INCOME" ? "pendapatan" : "belanja"})`).join("\n") || "Tiada transaksi.";
  return `${base}\nBelanja mengikut kategori:\n${breakdown}\nTransaksi terkini:\n${recent}`;
}

export type FinanceAnswer = Awaited<ReturnType<typeof queryTelegramFinance>>;

function renderAnalysis(result: Extract<FinanceAnswer, { kind: "ANALYSIS" }>) {
  const period = `${result.month}${result.monthToDate ? " setakat hari ini" : ""}`;
  if (!result.hasRecords) {
    return `Belum ada transaksi direkod untuk ${period}. Untuk mula, catat pendapatan, bil tetap dan belanja harian. Dari situ kita boleh tengok kategori mana yang sesuai diberi had.`;
  }
  const lines = [
    `${result.focus === "SAVINGS" ? "Ruang untuk berjimat" : "Ringkasan kewangan"} · ${period}`,
    `Pendapatan ${formatMyr(result.income)} · Belanja ${formatMyr(result.expense)} · Bersih direkod ${formatMyr(result.net)}`,
  ];
  if (result.change !== null && result.previousExpense !== null) {
    const change = new Decimal(result.change);
    const baseline = `${result.monthToDate ? "tempoh sepadan pada " : "bulan "}${result.previousMonth} (${formatMyr(result.previousExpense)})`;
    lines.push(change.isZero() ? `Belanja sama dengan ${baseline}.`
      : `Belanja ${change.isNegative() ? "turun" : "naik"} ${formatMyr(change.abs().toFixed(2))} berbanding ${baseline}.`);
  }
  if (result.top) lines.push(`Kategori belanja terbesar ialah ${result.top.name}, ${formatMyr(result.top.amount)}.`);
  for (const warning of result.warnings) {
    const remaining = new Decimal(warning.remaining);
    const progress = remaining.isNegative() ? `terlebih ${formatMyr(remaining.abs().toFixed(2))}`
      : remaining.isZero() ? "had sudah digunakan sepenuhnya" : `baki ${formatMyr(warning.remaining)}`;
    lines.push(`Bajet ${warning.categoryName} · ${formatMyr(warning.spent)} daripada ${formatMyr(warning.limit)}, ${progress}.`);
  }
  const reviewCategory = result.warnings[0]?.categoryName ?? result.top?.name;
  if (reviewCategory) lines.push(`Untuk berjimat, mula dengan semak belian ${reviewCategory}. Selepas asingkan perbelanjaan wajib, pilih satu belian yang boleh dikurangkan atau ditangguh.`);
  else lines.push("Catat belanja harian untuk nampak kategori mana yang sesuai disemak.");
  return lines.join("\n");
}

function renderPurchaseCheck(result: Extract<FinanceAnswer, { kind: "PURCHASE" }>) {
  const { budget, categoryName, amount, month } = result;
  if (!budget) return `Bajet ${categoryName} untuk ${month} belum ditetapkan. Tetapkan had kategori di DuitFlow untuk semak pembelian ${formatMyr(amount)} ini.`;
  const after = new Decimal(budget.after);
  const effect = after.isNegative() ? `bajet akan terlebih ${formatMyr(after.abs().toFixed(2))}`
    : after.isZero() ? "had bajet akan digunakan sepenuhnya" : `baki bajet jadi ${formatMyr(budget.after)}`;
  return `Simulasi bajet ${categoryName} · ${month}\nHad ${formatMyr(budget.limit)} · Dah belanja ${formatMyr(budget.spent)} · Baki ${formatMyr(budget.remaining)}\nJika tambah ${formatMyr(amount)}, ${effect}.`;
}

export function renderFinanceAnswer(result: FinanceAnswer) {
  switch (result.kind) {
    case "FUTURE_PERIOD": return "Pilih bulan ini atau bulan yang sudah lepas untuk semak rekod.";
    case "ANALYSIS": return renderAnalysis(result);
    case "TREND": return `Trend belanja yang direkod\n${result.rows.map((row) => `${row.month}${row.partial ? " (setakat hari ini)" : ""} · ${formatMyr(row.amount)}`).join("\n")}`;
    case "PURCHASE": return renderPurchaseCheck(result);
    case "PURCHASE_DETAILS": return "Sebut amaun dan satu kategori bajet supaya saya boleh kira kesannya. Contoh ‘Boleh spend RM100 untuk makan?’";
    case "UNKNOWN_CATEGORY": return "Kategori tidak jelas. Hantar semula soalan dengan nama kategori tepat daripada senarai web anda, atau gunakan /report atau /budget.";
    case "NET": return `${result.month}\nPendapatan: ${formatMyr(result.income)}\nBelanja: ${formatMyr(result.expense)}\nBersih direkod (pendapatan − belanja): ${formatMyr(result.net)}`;
    case "SPEND": return `${result.month} · ${result.categoryName}: ${formatMyr(result.amount)}`;
    case "TOTAL": return `Jumlah ${result.type === "EXPENSE" ? "belanja" : "pendapatan"} yang direkod untuk ${result.month} ialah ${formatMyr(result.amount)}.`;
    case "REPORT": return renderMonthlyReport(result.report, result.month, result.view);
    case "TOP": return `Kategori belanja tertinggi ${result.month}:\n${result.rows.map((row) => `${row.categoryName}: ${formatMyr(row.amount)}`).join("\n") || "Tiada belanja."}`;
    case "BUDGET": return `Bajet ${result.month}:\n${result.rows.map((row) => `${row.categoryName}: belanja ${formatMyr(row.spent)} / ${formatMyr(row.limit)}; baki ${formatMyr(row.remaining)} (${row.percent}%)`).join("\n") || "Tiada bajet. Tetapkan bajet di web."}`;
    case "RECENT": return `Transaksi terkini:\n${result.rows.map((row) => `${row.occurredOn} · ${row.description}: ${formatMyr(row.amount)} (${row.type === "INCOME" ? "pendapatan" : "belanja"})`).join("\n") || "Tiada transaksi."}`;
  }
}
