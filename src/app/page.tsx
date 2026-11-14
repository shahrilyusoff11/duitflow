import Link from "next/link";

const steps = [
  { number: "01", title: "Catat dengan mudah", text: "Pendapatan dan perbelanjaan harian, dalam satu tempat." },
  { number: "02", title: "Semak sebelum simpan", text: "Anda yang tentukan. Setiap cadangan melalui chat memerlukan pengesahan anda." },
  { number: "03", title: "Fahami aliran duit", text: "Lihat rekod bulanan dan rancang bajet mengikut kategori." },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
      <header className="site-header wrap">
        <Link className="brand" href="/" aria-label="DuitFlow, halaman utama">
          <span className="brand-icon" aria-hidden="true">d<span>.</span></span>
          DuitFlow<span className="brand-dot">.</span>
        </Link>
        <nav className="header-nav" aria-label="Navigasi utama">
          <a className="nav-link" href="#cara">Kenali DuitFlow <span aria-hidden="true">↗</span></a>
          <Link className="nav-link" href="/sign-in">Log masuk</Link>
        </nav>
      </header>
      <main id="kandungan">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow"><span className="status-dot" /> Akan datang</span>
            <p className="kicker">DUIT ANDA. CERITA ANDA.</p>
            <h1 id="hero-title">Kewangan harian,<br /><span>lebih teratur.</span></h1>
            <p className="hero-description">Catat belanja melalui chat, pantau bajet melalui dashboard. Ruang ringkas untuk lebih memahami aliran duit anda.</p>
            <a className="button" href="#cara">Lihat cara ia berfungsi <span aria-hidden="true">↓</span></a>
            <p className="hero-note">Direka untuk rutin harian di Malaysia.</p>
          </div>
          <div className="flow-panel" aria-label="Aliran yang dirancang: catat, semak, sahkan">
            <div className="panel-top"><span className="mini-brand">duitflow</span><span className="panel-label">SATU RUTIN RINGKAS</span></div>
            <div className="flow-item"><span className="flow-icon" aria-hidden="true">↗</span><div><span className="flow-caption">LANGKAH PERTAMA</span><p>Mulakan dengan catatan.</p></div></div>
            <div className="flow-connector" aria-hidden="true" />
            <div className="flow-item"><span className="flow-icon outline" aria-hidden="true">≡</span><div><span className="flow-caption">DALAM KAWALAN ANDA</span><p>Semak setiap butiran.</p></div></div>
            <div className="flow-connector" aria-hidden="true" />
            <div className="flow-item"><span className="flow-icon outline" aria-hidden="true">✓</span><div><span className="flow-caption">SELEPAS ANDA SAHKAN</span><p>Jadikan rekod lebih teratur.</p></div></div>
            <div className="panel-bottom"><span aria-hidden="true">✳</span> Sedikit demi sedikit, lebih jelas.</div>
          </div>
        </section>
        <section id="cara" className="how-section wrap" aria-labelledby="how-title">
          <div className="section-heading"><p className="kicker">DIREKA UNTUK MEMUDAHKAN</p><h2 id="how-title">Tabiat kecil. Gambaran lebih jelas.</h2><p>Inilah pengalaman yang sedang kami bina untuk anda.</p></div>
          <div className="step-grid">{steps.map((step) => <article className="step" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
        </section>
      </main>
      <footer className="site-footer wrap"><p>DuitFlow <span aria-hidden="true">·</span> Dibina untuk lebih teratur.</p><p>MYR <span aria-hidden="true">/</span> Malaysia</p></footer>
    </>
  );
}
