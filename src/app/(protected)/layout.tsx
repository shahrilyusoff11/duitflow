import { Brand } from "@/components/brand";
import "../finance.css";
import "./workspace.css";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { FinanceNavigation } from "@/components/finance/navigation";
import { requirePageUser } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>
    <a className="skip-link" href="#kandungan">Langkau ke kandungan</a>
    <header className="workspace-header">
      <div className="workspace-bar wrap">
        <Brand href="/dashboard" />
        <FinanceNavigation />
        <SignOutButton />
      </div>
    </header>
    <main id="kandungan" tabIndex={-1} className="account-main workspace-main wrap">{children}</main>
  </>;
}
