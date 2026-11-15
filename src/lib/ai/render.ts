import { formatMyr } from "@/lib/finance/money";
import type { queryTelegramFinance } from "@/lib/telegram/dal";

export function renderFinanceAnswer(result: Awaited<ReturnType<typeof queryTelegramFinance>>) {
  switch (result.kind) {
    case "UNKNOWN_CATEGORY": return "Kategori tidak jelas. Hantar semula soalan dengan nama kategori tepat daripada senarai web anda, atau gunakan /report atau /budget.";
    case "NET": return `${result.month}\nPendapatan: ${formatMyr(result.income)}\nBelanja: ${formatMyr(result.expense)}\nBersih direkod (pendapatan − belanja): ${formatMyr(result.net)}`;
    case "SPEND": return `${result.month} · ${result.categoryName}: ${formatMyr(result.amount)}`;
    case "TOP": return `Kategori belanja tertinggi ${result.month}:\n${result.rows.map((row) => `${row.categoryName}: ${formatMyr(row.amount)}`).join("\n") || "Tiada belanja."}`;
    case "BUDGET": return `Bajet ${result.month}:\n${result.rows.map((row) => `${row.categoryName}: belanja ${formatMyr(row.spent)} / ${formatMyr(row.limit)}; baki ${formatMyr(row.remaining)} (${row.percent}%)`).join("\n") || "Tiada bajet. Tetapkan bajet di web."}`;
    case "RECENT": return `Transaksi terkini:\n${result.rows.map((row) => `${row.occurredOn} · ${row.description}: ${formatMyr(row.amount)} (${row.type === "INCOME" ? "pendapatan" : "belanja"})`).join("\n") || "Tiada transaksi."}`;
  }
}
