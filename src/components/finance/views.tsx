import Link from "next/link";
import { Decimal, formatMyr } from "@/lib/finance/money";
import { displayDate, todayInMalaysia } from "@/lib/finance/dates";
import type { listBudgets, listCategories, listTransactions } from "@/lib/finance/dal";

export type Categories = Awaited<ReturnType<typeof listCategories>>;

export function CategorySelect({ categories, value, expenseOnly = false }: { categories: Categories; value?: string; expenseOnly?: boolean }) {
  return <label>Kategori<select name="categoryId" defaultValue={value ?? ""} required>
    <option value="" disabled>Pilih kategori</option>
    {categories.filter((category) => !expenseOnly || category.transactionType === "EXPENSE").map((category) => <option key={category.id} value={category.id}>{category.name} ({category.transactionType === "INCOME" ? "Pendapatan" : "Perbelanjaan"})</option>)}
  </select></label>;
}

export function TransactionFields({ categories, value }: { categories: Categories; value?: { amount: string; type: string; categoryId: string; description: string; occurredOn: string } }) {
  return <>
    <label>Jenis<select name="type" defaultValue={value?.type ?? "EXPENSE"}><option value="EXPENSE">Perbelanjaan</option><option value="INCOME">Pendapatan</option></select></label>
    <CategorySelect categories={categories} value={value?.categoryId} />
    <label>Amaun (MYR)<input name="amount" type="text" inputMode="decimal" defaultValue={value?.amount} placeholder="RM12.50" maxLength={80} title="Amaun positif, maksimum dua tempat perpuluhan. Contoh: RM12.50 atau 12 ringgit 50 sen." required /></label>
    <label>Keterangan<input name="description" defaultValue={value?.description} maxLength={500} required /></label>
    <label>Tarikh<input name="occurredOn" type="date" defaultValue={value?.occurredOn ?? todayInMalaysia()} min="2000-01-01" max="2100-12-31" required /></label>
  </>;
}

export function MonthPicker({ period }: { period: string }) {
  return <form className="filter-form" method="get"><label>Bulan<input name="month" type="month" defaultValue={period} min="2000-01" max="2100-12" required /></label><button className="button">Papar</button></form>;
}

export function TransactionsList({ rows }: { rows: Awaited<ReturnType<typeof listTransactions>>["rows"] }) {
  if (!rows.length) return <p className="empty-state">Tiada transaksi untuk pilihan ini. Tambah rekod pertama anda atau ubah penapis untuk melihat rekod lain.</p>;
  return <ul className="record-list">{rows.map((row) => <li key={row.id}>
    <div><Link className="text-link" href={`/transactions/${row.id}`}>{row.description}</Link><small>{row.categoryName} · {displayDate(row.occurredOn)}</small></div>
    <div className="record-amount"><strong>{formatMyr(row.amount)}</strong><small>{row.type === "INCOME" ? "Pendapatan" : "Perbelanjaan"}</small></div>
  </li>)}</ul>;
}

export function BudgetStatus({ budget }: { budget: Awaited<ReturnType<typeof listBudgets>>[number] }) {
  return <div className="budget-status">
    <p>{formatMyr(budget.spent)} dibelanjakan / {formatMyr(budget.limitAmount)}</p>
    <progress aria-label={`Penggunaan bajet ${budget.categoryName}`} max={100} value={budget.bar} />
    <p>{budget.percent}% · Baki {formatMyr(budget.remaining)}</p>
    <p className={budget.status === "OK" ? "" : "budget-warning"}>{budget.status === "EXCEEDED" ? "Had bajet dicapai atau dilebihi (100%)." : budget.status === "WARNING" ? `Amaran: sekurang-kurangnya ${budget.warningAt}% telah digunakan.` : `Amaran bermula pada ${budget.warningAt}%.`}</p>
  </div>;
}

export function TrendChart({ rows }: { rows: { month: string; income: string; expense: string }[] }) {
  const maximum = rows.reduce((max, row) => Decimal.max(max, row.income, row.expense), new Decimal(1));
  const width = (value: string) => new Decimal(value).div(maximum).mul(100).toFixed(2);
  return <figure className="trend-chart"><figcaption>Pendapatan dan perbelanjaan · 6 bulan</figcaption>
    {rows.map((row) => <div key={row.month} className="trend-row"><strong>{row.month}</strong><div>
      <div className="trend-track"><span className="trend-income" style={{ width: `${width(row.income)}%` }} /></div>
      <small>Pendapatan {formatMyr(row.income)}</small>
      <div className="trend-track"><span className="trend-expense" style={{ width: `${width(row.expense)}%` }} /></div>
      <small>Perbelanjaan {formatMyr(row.expense)}</small>
    </div></div>)}
  </figure>;
}
