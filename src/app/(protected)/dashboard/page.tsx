import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/auth/profile";
import { getDashboard, getUpcomingBills } from "@/lib/finance/dal";
import { Summary } from "@/components/finance/summary";
import { Icon } from "@/components/icon";
import { invalidFiltersMessage, selectedMonth, type SearchParams } from "@/lib/finance/page-params";
import { BudgetStatus, ExpenseBreakdown, MonthPicker, TrendChart } from "@/components/finance/views";
import { RecentActivity } from "@/components/finance/recent-activity";
import { UpcomingBills } from "@/components/finance/upcoming-bills";
import "./activity.css";

export const metadata = { title: "Dashboard — DuitFlow" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const period = selectedMonth((await searchParams).month);
  if (!period) return <p role="alert">{invalidFiltersMessage} <Link href="/dashboard">Tetapkan semula</Link></p>;
  const [profile, dashboard, bills] = await Promise.all([getUserProfile(user.id), getDashboard(user.id, period), getUpcomingBills(user.id)]);
  return <>
    <header className="dashboard-heading">
      <h1 className="account-title">Selamat datang, <span>{profile.name}.</span></h1>
      <div className="dashboard-tools"><MonthPicker period={period} /><Link className="button" href="/transactions#tambah">Tambah transaksi <Icon name="arrow" size={16} /></Link></div>
    </header>
    <Summary totals={dashboard} period={period} />
    <div className="account-grid analytics-grid">
      <section className="account-card"><h2>Trend enam bulan</h2><TrendChart rows={dashboard.trend} /></section>
      <section className="account-card"><h2>Perbelanjaan mengikut kategori</h2><ExpenseBreakdown rows={dashboard.breakdown} total={dashboard.expense} /></section>
    </div>
    <div className="dashboard-activity">
      <RecentActivity rows={dashboard.recent} />
      <section className="budget-panel" aria-labelledby="budget-title">
        <div className="budget-banner">
          <span className="budget-mark"><Icon name="wallet" size={27} /></span>
          <div><h2 id="budget-title">Bajet bulan ini</h2>
            {!dashboard.budgets.length && <p>Belum ada bajet untuk bulan ini. Tetapkan had mengikut kategori.</p>}
          </div>
          <Link className="budget-link" href={`/budgets?month=${period}`}>
            {dashboard.budgets.length ? "Urus bajet" : "Tetapkan bajet"} <Icon name="arrow" size={16} />
          </Link>
        </div>
        {dashboard.budgets.length > 0 && <div className="budget-items">{dashboard.budgets.map((budget) =>
          <section key={budget.id}><h3>{budget.categoryName}</h3><BudgetStatus budget={budget} /></section>
        )}</div>}
      </section>
      <UpcomingBills bills={bills} />
      <div className="dashboard-directory">
        <details><summary><Icon name="tag" />Kategori anda <span className="category-count">{profile.categories.length}</span><Icon name="chevron" size={16} /></summary>
          <div className="directory-content">{(["EXPENSE", "INCOME"] as const).map((type) => <div key={type} className="category-group">
            <h3>{type === "EXPENSE" ? "Perbelanjaan" : "Pendapatan"}</h3>
            <ul className="category-list">{profile.categories.filter((category) => category.transactionType === type).map((category) => <li key={category.id}>{category.name}</li>)}</ul>
          </div>)}<Link className="activity-link" href="/categories">Urus kategori <Icon name="arrow" size={15} /></Link></div>
        </details>
        <details><summary><Icon name="user" />Maklumat anda <Icon name="chevron" size={16} /></summary>
          <dl className="directory-profile">
            <div><dt>Nama</dt><dd>{profile.name}</dd></div>
            <div><dt>E-mel</dt><dd>{profile.email}</dd></div>
            <div><dt>Persetujuan DeepSeek</dt><dd>{profile.aiParsingEnabled ? "Dihidupkan" : "Dimatikan"}</dd></div>
          </dl>
        </details>
      </div>
    </div>
  </>;
}
