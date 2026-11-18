import Link from "next/link";
import { Icon } from "@/components/icon";
import type { getUpcomingBills } from "@/lib/finance/dal";
import { displayDate } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";

type BillForecast = Awaited<ReturnType<typeof getUpcomingBills>>;

function BillDueList({ rows }: { rows: BillForecast["occurrences"] }) {
  return <ul className="bill-due-list">
    {rows.map((bill) => <li key={`${bill.id}:${bill.dueOn}`}>
      <div className="bill-due-name"><strong>{bill.name}</strong><time dateTime={bill.dueOn}>{displayDate(bill.dueOn)}</time></div>
      <strong className="bill-due-amount">{formatMyr(bill.amount)}</strong>
      {bill.canPay && <Link className="bill-payment" href={`/bills/${bill.id}/payment`} aria-label={`Rekod bayaran ${bill.name}`}>Rekod</Link>}
    </li>)}
  </ul>;
}

export function UpcomingBills({ bills }: { bills: BillForecast }) {
  const preview = bills.occurrences.slice(0, 3);
  const remaining = bills.occurrences.slice(preview.length);
  return <section className="dashboard-card" aria-labelledby="upcoming-bills-heading">
    <header className="activity-heading">
      <h2 id="upcoming-bills-heading">Bil akan datang</h2>
      <Link className="activity-link" href="/bills">Urus bil <Icon name="arrow" size={16} /></Link>
    </header>
    <div className="bill-forecast">
      <span>Unjuran 30 hari</span>
      <strong>{formatMyr(bills.total)}</strong>
    </div>
    {bills.overdue > 0 && <Link className="activity-link overdue-link" href="/bills#tertunggak">{bills.overdue} bil tertunggak <Icon name="arrow" size={15} /></Link>}
    {preview.length ? <BillDueList rows={preview} /> : <p className="dashboard-empty">Tiada bil dijadualkan dalam 30 hari ini.</p>}
    {remaining.length > 0 && <details className="bill-disclosure">
      <summary>Lihat {remaining.length} lagi</summary>
      <BillDueList rows={remaining} />
    </details>}
  </section>;
}
