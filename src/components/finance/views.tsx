import { Decimal, formatMyr } from "@/lib/finance/money";
import { todayInMalaysia } from "@/lib/finance/dates";
import type { listBudgets, listCategories } from "@/lib/finance/dal";
import { TypeCategoryFields } from "./type-category-fields";

export type Categories = Awaited<ReturnType<typeof listCategories>>;

export function CategorySelect({ categories, value, expenseOnly = false }: { categories: Categories; value?: string; expenseOnly?: boolean }) {
  return <label>Kategori<select name="categoryId" defaultValue={value ?? ""} required>
    <option value="" disabled>Pilih kategori</option>
    {categories.filter((category) => !expenseOnly || category.transactionType === "EXPENSE").map((category) => <option key={category.id} value={category.id}>{category.name} ({category.transactionType === "INCOME" ? "Pendapatan" : "Perbelanjaan"})</option>)}
  </select></label>;
}

export function TransactionFields({ categories, value }: { categories: Categories; value?: { amount: string; type: Categories[number]["transactionType"]; categoryId: string; description: string; occurredOn: string } }) {
  const defaultType = categories.some((category) => category.transactionType === "EXPENSE") ? "EXPENSE" : "INCOME";
  return <>
    <TypeCategoryFields categories={categories} initialType={value?.type ?? defaultType} initialCategory={value?.categoryId} />
    <TransactionDetailsFields value={value} />
  </>;
}

export function TransactionDetailsFields({ value }: { value?: { amount: string; description: string; occurredOn: string } }) {
  return <>
    <label>Amaun (MYR)<input name="amount" type="text" inputMode="decimal" defaultValue={value?.amount} placeholder="RM12.50" maxLength={80} title="Amaun positif, maksimum dua tempat perpuluhan. Contoh: RM12.50 atau 12 ringgit 50 sen." required /></label>
    <label>Keterangan<input name="description" defaultValue={value?.description} placeholder="Contoh: Makan tengah hari" maxLength={500} required /></label>
    <label>Tarikh<input name="occurredOn" type="date" defaultValue={value?.occurredOn ?? todayInMalaysia()} min="2000-01-01" max="2100-12-31" required /></label>
  </>;
}

export function MonthPicker({ period }: { period: string }) {
  return <form className="filter-form" method="get"><label>Bulan<input name="month" type="month" defaultValue={period} min="2000-01" max="2100-12" required /></label><button className="button">Papar</button></form>;
}

export function BudgetStatus({ budget }: { budget: Awaited<ReturnType<typeof listBudgets>>[number] }) {
  return <div className="budget-status" data-status={budget.status}>
    <div className="budget-usage"><strong>{budget.percent}%</strong><span>digunakan</span></div>
    <progress aria-label={`Penggunaan bajet ${budget.categoryName}`} max={100} value={budget.bar} />
    <p>{formatMyr(budget.spent)} daripada {formatMyr(budget.limitAmount)}</p>
    <p className="budget-remaining"><span>Baki</span><strong>{formatMyr(budget.remaining)}</strong></p>
    <p className={budget.status === "OK" ? "" : "budget-warning"}>{budget.status === "EXCEEDED" ? "Had bajet dicapai atau dilebihi (100%)." : budget.status === "WARNING" ? `Amaran: sekurang-kurangnya ${budget.warningAt}% telah digunakan.` : `Amaran bermula pada ${budget.warningAt}%.`}</p>
  </div>;
}

export function TrendChart({ rows }: { rows: { month: string; income: string; expense: string }[] }) {
  const maximum = rows.reduce((max, row) => Decimal.max(max, row.income, row.expense), new Decimal(0));
  const height = (value: string) => `${new Decimal(value).div(maximum).mul(100).toFixed(2)}%`;
  const monthLabel = new Intl.DateTimeFormat("ms-MY", { month: "short", timeZone: "UTC" });
  return <figure className="trend-chart"><figcaption className="legend"><span>Pendapatan</span><span>Perbelanjaan</span></figcaption>
    {maximum.isZero() ? <p className="chart-empty">Belum ada transaksi dalam tempoh enam bulan ini.</p> :
    <div className="chart-frame" aria-hidden="true"><div className="plot-scale"><span>{formatMyr(maximum.toFixed(2))}</span><span>RM 0</span></div>
    <div className="plot">{rows.map((row) => <div key={row.month} className="plot-month">
      <div className="plot-pair"><i style={{ height: height(row.income) }} /><i style={{ height: height(row.expense) }} /></div>
      <span>{monthLabel.format(new Date(`${row.month}-01T00:00:00Z`))}</span>
    </div>)}</div></div>}
    <details className="chart-data"><summary>Lihat angka bulanan</summary><table>
      <caption className="sr-only">Pendapatan dan perbelanjaan mengikut bulan</caption>
      <thead><tr><th scope="col">Bulan</th><th scope="col">Pendapatan</th><th scope="col">Perbelanjaan</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.month}><th scope="row">{row.month}</th><td>{formatMyr(row.income)}</td><td>{formatMyr(row.expense)}</td></tr>)}</tbody>
    </table></details>
  </figure>;
}

export function ExpenseBreakdown({ rows, total }: { rows: { name: string; amount: string }[]; total: string }) {
  if (!rows.length || new Decimal(total).isZero()) return <p className="empty-state">Belum ada perbelanjaan bulan ini.</p>;
  return <ul className="breakdown">{rows.toSorted((a, b) => new Decimal(b.amount).cmp(a.amount)).map((row) => {
    const percent = new Decimal(row.amount).div(total).mul(100).toFixed(1);
    return <li key={row.name}><div><span>{row.name}</span><strong>{formatMyr(row.amount)}</strong></div>
      <div className="breakdown-share"><div className="breakdown-meter"><i style={{ width: `${percent}%` }} /></div><small>{percent}%<span className="sr-only"> daripada perbelanjaan</span></small></div>
    </li>;
  })}</ul>;
}
