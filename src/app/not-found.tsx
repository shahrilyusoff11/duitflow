import Link from "next/link";

export default function NotFound() {
  return <main className="auth-screen"><section className="auth-card" aria-labelledby="not-found-title">
    <p className="kicker">HALAMAN TIDAK DITEMUI</p>
    <h1 id="not-found-title" className="account-title">Tiada di sini.</h1>
    <p className="auth-description">Halaman atau rekod ini tidak tersedia. Semak alamat atau kembali ke halaman utama.</p>
    <Link className="button" href="/">Kembali ke halaman utama</Link>
    <p><Link className="text-link" href="/demo">Teroka demo baca sahaja</Link></p>
  </section></main>;
}
