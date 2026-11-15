import type { Metadata } from "next";
import Link from "next/link";
import "../finance.css";
import "./demo.css";
import { BudgetStatus, TrendChart } from "@/components/finance/views";
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
    <header className="site-header wrap">
      <Link className="brand" href="/" aria-label="DuitFlow, halaman utama">DuitFlow<span className="brand-dot">.</span></Link>
      <Link className="quiet-button" href="/sign-in">Log masuk</Link>
    </header>
    <main id="kandungan" className="account-main wrap demo-main" tabIndex={-1}>
      <p className="kicker">LIHAT GAMBARAN DUITFLOW</p>
      <h1 className="account-title">Demo <span>baca sahaja.</span></h1>
      <p className="auth-description">Semua angka dan catatan di sini ialah data rekaan untuk portfolio. Tiada data akaun sebenar dipaparkan.</p>
      <p className="notice">Contoh tetap: November 2026 · MYR · tarikh Malaysia. Demo ini tidak menyimpan perubahan, memaut Telegram atau menggunakan AI.</p>
      <nav className="finance-nav" aria-label="Bahagian demo">
        <a href="#ringkasan">Ringkasan</a><a href="#bajet">Bajet contoh</a><a href="#transaksi">Transaksi contoh</a>
      </nav>
      <section id="ringkasan" aria-labelledby="ringkasan-title" className="demo-section">
        <h2 id="ringkasan-title">Ringkasan November 2026</h2>
        <div className="summary-grid">
          <section className="account-card"><h3>Pendapatan</h3><strong className="summary-value">{formatMyr(demo.income)}</strong></section>
          <section className="account-card"><h3>Perbelanjaan</h3><strong className="summary-value">{formatMyr(demo.expense)}</strong></section>
          <section className="account-card"><h3>Pendapatan bersih direkod</h3><strong className="summary-value">{formatMyr(demo.net)}</strong><p>Pendapatan tolak perbelanjaan bagi bulan contoh.</p></section>
        </div>
        <div className="account-grid">
          <section className="account-card"><h3>Perbelanjaan mengikut kategori</h3><ul className="record-list">{demo.breakdown.map((row) => <li key={row.name}><span>{row.name}</span><strong>{formatMyr(row.amount)}</strong></li>)}</ul></section>
          <section className="account-card"><h3>Trend bulanan contoh</h3><TrendChart rows={demo.trend} /><p className="auth-note">Bulan terdahulu ialah contoh ringkasan rekaan; November dikira daripada transaksi contoh di bawah.</p></section>
        </div>
      </section>
      <section id="bajet" aria-labelledby="bajet-title" className="demo-section">
        <h2 id="bajet-title">Bajet contoh</h2>
        <p>Belanja sebenar dalam rekod contoh menentukan penggunaan bajet. Baki boleh menjadi negatif apabila had dilebihi.</p>
        <div className="demo-budget-grid">{demo.budgets.map((budget) => <article className="account-card" key={budget.id}><h3>{budget.categoryName}</h3><BudgetStatus budget={budget} /></article>)}</div>
      </section>
      <section id="transaksi" aria-labelledby="transaksi-title" className="demo-section account-card">
        <h2 id="transaksi-title">Transaksi contoh</h2>
        <p>8 rekod rekaan · November 2026. Catatan Telegram mewakili rekod selepas pengesahan Sahkan.</p>
        <ul className="record-list">{demo.records.map((record) => <li key={record.description}>
          <div><strong>{record.description}</strong><small>{record.categoryName} · {displayDate(record.occurredOn)} · {record.source === "TELEGRAM" ? "Telegram" : "Web"}</small></div>
          <div className="record-amount"><strong>{formatMyr(record.amount)}</strong><small>{record.type === "INCOME" ? "Pendapatan" : "Perbelanjaan"}</small></div>
        </li>)}</ul>
      </section>
      <section className="demo-section account-card" aria-labelledby="mula-title">
        <h2 id="mula-title">Mulakan rekod anda sendiri</h2>
        <p>Log masuk dengan GitHub untuk mengurus transaksi dan bajet peribadi. Data demo ini kekal berasingan daripada akaun anda.</p>
        <Link className="button" href="/sign-in">Log masuk dengan GitHub</Link>
      </section>
    </main>
    <footer className="site-footer wrap"><p>DuitFlow · Demo data rekaan, baca sahaja.</p><p>MYR / Malaysia</p></footer>
  </>;
}
