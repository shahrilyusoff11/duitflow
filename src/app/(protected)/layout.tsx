import Link from "next/link";
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
    <main id="kandungan" className="account-main wrap">{children}</main>
    <footer className="site-footer wrap"><p>DuitFlow · Ruang kewangan peribadi anda.</p><p>MYR / Malaysia</p></footer>
  </>;
}
