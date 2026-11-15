import Link from "next/link";

export default function ProtectedNotFound() {
  return <section className="account-card" aria-labelledby="record-not-found-title">
    <p className="kicker">REKOD TIDAK TERSEDIA</p>
    <h1 id="record-not-found-title" className="account-title">Rekod tidak ditemui.</h1>
    <p>Rekod ini mungkin telah dipadam atau tidak tersedia untuk akaun anda.</p>
    <Link className="text-link" href="/transactions">← Semua transaksi</Link>
  </section>;
}
