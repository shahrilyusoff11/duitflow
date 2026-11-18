import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
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
  const [dashboard, bills] = await Promise.all([getDashboard(user.id, period), getUpcomingBills(user.id)]);
  return <div className="dashboard-page">
    <header className="workspace-heading dashboard-heading">
      <div className="dashboard-title">
        <h1 className="account-title">Dashboard</h1>
        <p>Selamat datang, {user.name}.</p>
      </div>
      <div className="workspace-tools">
        <MonthPicker key={period} period={period} />
        <Link className="button" href="/transactions#tambah"><Icon name="plus" size={17} />Tambah transaksi</Link>
      </div>
    </header>
    <Summary totals={dashboard} period={period} />
    <div className="dashboard-activity">
      <div className="dashboard-column">
        <RecentActivity rows={dashboard.recent} />
        <section className="dashboard-card" aria-labelledby="trend-title">
          <header className="activity-heading"><h2 id="trend-title">Trend enam bulan</h2></header>
          <div className="dashboard-card-body"><TrendChart rows={dashboard.trend} interactive /></div>
        </section>
      </div>
      <div className="dashboard-column">
        <UpcomingBills bills={bills} />
        <section className="dashboard-card" aria-labelledby="budget-title">
          <header className="activity-heading">
            <h2 id="budget-title">Bajet bulanan</h2>
            <Link className="activity-link" href={`/budgets?month=${period}`}>
              {dashboard.budgets.length ? "Urus bajet" : "Tetapkan bajet"} <Icon name="arrow" size={16} />
            </Link>
          </header>
          {dashboard.budgets.length ? <div className="budget-items">{dashboard.budgets.map((budget) =>
            <section key={budget.id}><h3>{budget.categoryName}</h3><BudgetStatus budget={budget} compact /></section>
          )}</div> : <p className="dashboard-empty">Belum ada bajet untuk bulan yang dipilih.</p>}
        </section>
        <section className="dashboard-card" aria-labelledby="breakdown-title">
          <header className="activity-heading"><h2 id="breakdown-title">Perbelanjaan mengikut kategori</h2></header>
          <div className="dashboard-card-body"><ExpenseBreakdown rows={dashboard.breakdown} total={dashboard.expense} /></div>
        </section>
      </div>
    </div>
  </div>;
}
