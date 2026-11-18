import Link from "next/link";
import { Icon } from "@/components/icon";
import { displayDate } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import type { listTransactions } from "@/lib/finance/dal";
import "./transaction-ledger.css";

export function TransactionLedger({ rows }: { rows: Awaited<ReturnType<typeof listTransactions>>["rows"] }) {
  return <div className="transaction-ledger">
    <div className="ledger-columns" aria-hidden="true"><span>Transaksi</span><span>Kategori</span><span>Tarikh</span><span>Amaun</span></div>
      <ul className="ledger-list">{rows.map((row) => {
        const income = row.type === "INCOME";
        return <li key={row.id}>
          <Link href={`/transactions/${row.id}`} className="ledger-row" data-flow={row.type} aria-labelledby={`record-name-${row.id}`} aria-describedby={`record-category-${row.id} record-date-${row.id} record-amount-${row.id}`}>
            <span className="ledger-mark"><Icon name={income ? "income" : "expense"} size={18} /></span>
            <strong id={`record-name-${row.id}`} className="ledger-name">{row.description}</strong>
            <span id={`record-category-${row.id}`} className="ledger-category">{row.categoryName}</span>
            <time id={`record-date-${row.id}`} className="ledger-date" dateTime={row.occurredOn}>{displayDate(row.occurredOn)}</time>
            <strong id={`record-amount-${row.id}`} className="ledger-money"><span className="sr-only">{income ? "Pendapatan" : "Perbelanjaan"} </span>{income ? "+" : "−"}{formatMyr(row.amount)}</strong>
          </Link>
        </li>;
      })}</ul>
  </div>;
}
