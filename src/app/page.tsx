import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Summary } from "@/components/finance/summary";
import { getDemoSnapshot } from "@/lib/demo/snapshot";
import "./landing.css";

const features = [
  { icon: "book", title: "Catat setiap transaksi", text: "Rekod pendapatan dan perbelanjaan mengikut tarikh dan kategori." },
  { icon: "chat", title: "Hantar melalui Telegram", text: "Taip “Makan RM12” dalam chat. Semak butirannya dan tekan Sahkan untuk menyimpan." },
  { icon: "chart", title: "Pantau bajet bulanan", text: "Tetapkan had mengikut kategori dan lihat baki selepas setiap perbelanjaan." },
] as const;

export default function Home() {
  const demo = getDemoSnapshot();
  return <>
    <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
    <header className="site-header wrap">
      <Brand />
      <nav className="header-nav" aria-label="Navigasi utama">
        <a className="nav-link" href="#cara">Cara kerja</a>
        <Link className="nav-link" href="/demo">Demo</Link>
        <Link className="button" href="/sign-in">Log masuk <Icon name="arrow" size={16} /></Link>
      </nav>
    </header>
    <main id="kandungan" tabIndex={-1} className="wrap">
      <section className="hero" aria-labelledby="hero-title">
        <Image className="hero-art" src="/senja-kl.webp" alt="" fill sizes="(max-width: 1200px) 100vw, 1280px" preload />
        <div className="hero-copy">
          <p className="hero-label"><span aria-hidden="true" /> Jurnal kewangan peribadi</p>
          <h1 id="hero-title">Kewangan harian,<br /><em>lebih teratur.</em></h1>
          <p className="hero-description">Catat belanja melalui chat, pantau bajet bulanan dan fahami aliran duit anda dalam satu ruang.</p>
          <div className="hero-actions">
            <Link className="button button-peach" href="/demo">Teroka demo <Icon name="arrow" /></Link>
            <a className="hero-secondary" href="#cara">Lihat cara ia berfungsi <Icon name="down" size={15} /></a>
          </div>
        </div>
        <p className="art-caption"><Icon name="pin" size={14} /> Kuala Lumpur, Malaysia</p>
      </section>
      <section className="home-section" aria-labelledby="snapshot-heading">
        <div className="section-bar">
          <div><p className="kicker"><span className="sample-dot" /> Demo portfolio</p><h2 id="snapshot-heading">Ringkasan bulanan</h2><p className="section-note">November 2026 · Data rekaan</p></div>
          <Link className="inline-link" href="/demo">Lihat demo penuh <Icon name="outward" size={15} /></Link>
        </div>
        <Summary totals={demo} period={demo.period} level={3} />
      </section>
      <section id="cara" className="home-section how" aria-labelledby="how-title">
        <h2 id="how-title">Tabiat kecil. <em>Gambaran lebih jelas.</em></h2>
        <div className="step-grid">{features.map(({ icon, title, text }) => <article key={icon}>
          <Icon name={icon} size={25} /><h3>{title}</h3><p>{text}</p>
        </article>)}</div>
      </section>
    </main>
    <footer className="site-footer wrap"><Brand /><span>MYR · Malaysia</span></footer>
  </>;
}
