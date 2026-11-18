import Link from "next/link";
import { Icon } from "@/components/icon";
import type { getUpcomingBills } from "@/lib/finance/dal";
import { displayDate } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";

export function UpcomingBills({ bills }: { bills: Awaited<ReturnType<typeof getUpcomingBills>> }) {
  return <section className="account-card upcoming-bills" aria-labelledby="upcoming-bills-heading">
    <div className="bill-heading">
      <div>
        <h2 id="upcoming-bills-heading">Bil akan datang</h2>
        <p>30 hari seterusnya <strong>{formatMyr(bills.total)}</strong></p>
      </div>
      <Link className="activity-link" href="/bills">Urus bil <Icon name="arrow" size={16} /></Link>
    </div>
    {bills.occurrences.length ? <ul className="record-list bill-due-list">
      {bills.occurrences.map((bill) => <li key={`${bill.id}:${bill.dueOn}`}>
        <div><strong>{bill.name}</strong><small><time dateTime={bill.dueOn}>{displayDate(bill.dueOn)}</time></small></div>
        <strong className="record-amount">{formatMyr(bill.amount)}</strong>
        {bill.canPay && <Link className="activity-link" href={`/bills/${bill.id}/payment`} aria-label={`Rekod bayaran ${bill.name}`}>Rekod bayaran</Link>}
      </li>)}
    </ul> : <p className="empty-state">Tiada bil dijadualkan dalam 30 hari ini.</p>}
    {bills.overdue > 0 && <Link className="activity-link budget-warning" href="/bills#senarai">{bills.overdue} bil tertunggak <Icon name="arrow" size={15} /></Link>}
  </section>;
}
