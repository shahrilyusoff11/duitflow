import Link from "next/link";
import { Icon } from "@/components/icon";
import type { getDashboard } from "@/lib/finance/dal";
import { TransactionLedger } from "./transaction-ledger";

type RecentRecords = Awaited<ReturnType<typeof getDashboard>>["recent"];

export function RecentActivity({ rows }: { rows: RecentRecords }) {
  return <section className="dashboard-card activity-ledger" aria-labelledby="recent-title">
    <header className="activity-heading">
      <h2 id="recent-title">Transaksi terkini</h2>
      <Link className="activity-link" href="/transactions#rekod">Semua transaksi <Icon name="arrow" size={16} /></Link>
    </header>
    {rows.length ? <TransactionLedger rows={rows} /> : <p className="dashboard-empty">Belum ada transaksi untuk bulan yang dipilih.</p>}
  </section>;
}
