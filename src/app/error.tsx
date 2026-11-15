"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="auth-screen"><section className="auth-card" aria-labelledby="error-title">
    <p className="kicker">SAMBUNGAN TERGANGGU</p>
    <h1 id="error-title" className="account-title">Ada masalah<br /><span>buat sementara.</span></h1>
    <p className="auth-description">Kami tidak dapat memuatkan halaman ini. Sila cuba lagi sebentar.</p>
    <button className="button" type="button" onClick={retry}>Cuba lagi</button>
    <p className="auth-note">Jika masalah berterusan, kembali kemudian. Semak rekod sebelum menghantar semula sebarang perubahan.</p>
    <Link className="text-link" href="/">← Kembali ke halaman utama</Link>
  </section></main>;
}
