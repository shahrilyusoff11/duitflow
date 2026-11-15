import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/auth/profile";
import { getDashboard } from "@/lib/finance/dal";
import { formatMyr } from "@/lib/finance/money";
import { invalidFiltersMessage, selectedMonth, type SearchParams } from "@/lib/finance/page-params";
import { BudgetStatus, MonthPicker, TransactionsList, TrendChart } from "@/components/finance/views";

export const metadata = { title: "Dashboard — DuitFlow" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const period = selectedMonth((await searchParams).month);
  if (!period) return <p role="alert">{invalidFiltersMessage} <Link href="/dashboard">Tetapkan semula</Link></p>;
  const [profile, dashboard] = await Promise.all([getUserProfile(user.id), getDashboard(user.id, period)]);
  return <>
    <p className="kicker">RUANG PERIBADI ANDA</p>
    <h1 className="account-title">Selamat datang, <span>{profile.name}.</span></h1>
    <MonthPicker period={period} />
    <div className="summary-grid">
      <section className="account-card"><h2>Pendapatan</h2><strong className="summary-value">{formatMyr(dashboard.income)}</strong></section>
      <section className="account-card"><h2>Perbelanjaan</h2><strong className="summary-value">{formatMyr(dashboard.expense)}</strong></section>
      <section className="account-card"><h2>Pendapatan bersih direkod</h2><strong className="summary-value">{formatMyr(dashboard.net)}</strong><p>Pendapatan tolak perbelanjaan bagi bulan dipilih.</p></section>
    </div>
    <div className="account-grid">
      <section className="account-card"><h2>Perbelanjaan mengikut kategori</h2>{dashboard.breakdown.length ? <ul className="record-list">{dashboard.breakdown.map((row) => <li key={row.categoryId}><span>{row.name}</span><strong>{formatMyr(row.amount)}</strong></li>)}</ul> : <p>Belum ada perbelanjaan bulan ini.</p>}</section>
      <section className="account-card"><h2>Trend bulanan</h2><TrendChart rows={dashboard.trend} /></section>
      <section className="account-card"><h2>Bajet bulan ini</h2>{dashboard.budgets.length ? dashboard.budgets.map((budget) => <div key={budget.id}><h3>{budget.categoryName}</h3><BudgetStatus budget={budget} /></div>) : <p>Belum ada bajet. <Link className="text-link" href={`/budgets?month=${period}`}>Tetapkan bajet</Link></p>}</section>
      <section className="account-card"><h2>Transaksi terkini</h2><TransactionsList rows={dashboard.recent} /><Link className="text-link" href="/transactions">Semua transaksi</Link></section>
      <section className="account-card"><h2>Kategori anda</h2>{(["EXPENSE", "INCOME"] as const).map((type) => <div key={type} className="category-group"><h3>{type === "EXPENSE" ? "Perbelanjaan" : "Pendapatan"}</h3><ul className="category-list">{profile.categories.filter((category) => category.transactionType === type).map((category) => <li key={category.id}>{category.name}</li>)}</ul></div>)}<Link className="text-link" href="/categories">Urus kategori</Link></section>
      <section className="account-card"><h2>Maklumat anda</h2><dl className="profile-details"><dt>Nama</dt><dd>{profile.name}</dd><dt>E-mel</dt><dd>{profile.email}</dd><dt>Penghuraian AI</dt><dd>{profile.aiParsingEnabled ? "Aktif" : "Tidak aktif"}</dd></dl></section>
    </div>
  </>;
}
