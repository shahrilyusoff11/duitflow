import { Brand } from "@/components/brand";
import "../finance.css";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { FinanceNavigation } from "@/components/finance/navigation";
import { requirePageUser } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>
    <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
    <header className="site-header wrap">
      <Brand href="/dashboard" />
      <SignOutButton />
    </header>
    <FinanceNavigation />
    <main id="kandungan" tabIndex={-1} className="account-main wrap">{children}</main>
    <footer className="site-footer wrap"><p>DuitFlow · Ruang kewangan peribadi anda.</p><p>MYR / Malaysia</p></footer>
  </>;
}
