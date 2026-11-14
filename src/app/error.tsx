"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="auth-screen"><section className="auth-card">
    <p className="kicker">SAMBUNGAN TERGANGGU</p>
    <h1 className="account-title">Ada masalah<br /><span>buat sementara.</span></h1>
    <p className="auth-description">Kami tidak dapat memuatkan halaman ini. Sila cuba lagi sebentar.</p>
    <button className="button" type="button" onClick={reset}>Cuba lagi</button>
  </section></main>;
}
