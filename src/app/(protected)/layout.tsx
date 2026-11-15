import Link from "next/link";
import "../finance.css";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { requirePageUser } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>
    <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
    <header className="site-header wrap">
      <Link className="brand" href="/dashboard">DuitFlow<span className="brand-dot">.</span></Link>
      <SignOutButton />
    </header>
    <nav className="finance-nav wrap" aria-label="Navigasi kewangan">
      <Link href="/dashboard">Dashboard</Link><Link href="/transactions">Transaksi</Link><Link href="/budgets">Bajet</Link><Link href="/categories">Kategori</Link><Link href="/settings">Tetapan</Link>
    </nav>
    <main id="kandungan" className="account-main wrap">{children}</main>
    <footer className="site-footer wrap"><p>DuitFlow · Ruang kewangan peribadi anda.</p><p>MYR / Malaysia</p></footer>
  </>;
}
