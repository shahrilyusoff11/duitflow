import type { Metadata } from "next";
import Link from "next/link";
import "../finance.css";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Summary } from "@/components/finance/summary";
import { BudgetStatus, ExpenseBreakdown, TrendChart } from "@/components/finance/views";
import { getDemoSnapshot } from "@/lib/demo/snapshot";
import { displayDate } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";

export const metadata: Metadata = {
  title: "Demo baca sahaja — DuitFlow",
  description: "Terokai dashboard DuitFlow dengan data rekaan. Tiada akaun atau sambungan perkhidmatan diperlukan.",
};

export default function DemoPage() {
  const demo = getDemoSnapshot();
  return <>
    <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
    <header className="site-header wrap"><Brand /><Link className="button" href="/sign-in">Log masuk <Icon name="arrow" size={16} /></Link></header>
    <main id="kandungan" className="account-main wrap demo-main" tabIndex={-1}>
      <div className="demo-banner"><h1 className="account-title">Demo <span>baca sahaja.</span></h1>
        <p>Semua angka dan catatan di sini ialah data rekaan. Terokai aliran duit dan bajet bagi November 2026.</p>
      </div>
      <nav className="finance-nav demo-nav" aria-label="Bahagian demo">
        <a href="#ringkasan">Ringkasan</a><a href="#bajet">Bajet contoh</a><a href="#transaksi">Transaksi contoh</a>
      </nav>
      <section id="ringkasan" aria-labelledby="ringkasan-title" className="demo-section">
        <h2 className="section-title" id="ringkasan-title">Ringkasan November 2026</h2>
        <Summary totals={demo} period={demo.period} level={3} />
        <div className="account-grid analytics-grid">
          <section className="account-card"><h3>Trend enam bulan</h3><TrendChart rows={demo.trend} /></section>
          <section className="account-card"><h3>Perbelanjaan mengikut kategori</h3><ExpenseBreakdown rows={demo.breakdown} total={demo.expense} /></section>
        </div>
      </section>
      <section id="bajet" aria-labelledby="bajet-title" className="demo-section">
        <h2 className="section-title" id="bajet-title">Bajet contoh</h2>
        <div className="demo-budget-grid">{demo.budgets.map((budget) => <article className="account-card" key={budget.id}><h3>{budget.categoryName}</h3><BudgetStatus budget={budget} /></article>)}</div>
      </section>
      <section id="transaksi" aria-labelledby="transaksi-title" className="demo-section account-card">
        <h2 id="transaksi-title">Transaksi contoh</h2><p>{demo.records.length} rekod · November 2026</p>
        <ul className="record-list">{demo.records.map((record) => <li key={record.description}>
          <div><strong>{record.description}</strong><small>{record.categoryName} · {displayDate(record.occurredOn)} · {record.source === "TELEGRAM" ? "Telegram" : "Web"}</small></div>
          <div className="record-amount" data-type={record.type}><strong>{formatMyr(record.amount)}</strong><small>{record.type === "INCOME" ? "Pendapatan" : "Perbelanjaan"}</small></div>
        </li>)}</ul>
      </section>
      <section className="demo-cta" aria-labelledby="mula-title"><div>
        <h2 id="mula-title">Mulakan rekod anda sendiri</h2><p>Urus transaksi dan bajet dalam akaun peribadi anda.</p></div>
        <Link className="button button-peach" href="/sign-in">Log masuk dengan GitHub <Icon name="arrow" /></Link>
      </section>
    </main>
    <footer className="site-footer wrap"><Brand /><span>MYR · Malaysia</span></footer>
  </>;
}
