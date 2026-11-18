import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { listBills, listCategories } from "@/lib/finance/dal";
import { displayDate, todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { MutationForm } from "@/components/finance/mutation-form";
import { CategorySelect, type Categories } from "@/components/finance/views";

export const metadata = { title: "Bil berulang — DuitFlow" };

type Bill = Awaited<ReturnType<typeof listBills>>[number];
const cadenceLabels = { MONTHLY: "Setiap bulan", YEARLY: "Setiap tahun" };

function BillFields({ categories, today, bill }: { categories: Categories; today: string; bill?: Bill }) {
  return <>
    <label>Nama bil<input name="name" defaultValue={bill?.name} maxLength={80} required /></label>
    <label>Amaun (MYR)<input name="amount" inputMode="decimal" defaultValue={bill?.amount} placeholder="RM129.00" maxLength={80} required /></label>
    <CategorySelect categories={categories} value={bill?.categoryId} expenseOnly />
    <label>Kekerapan<select name="cadence" defaultValue={bill?.cadence ?? "MONTHLY"}>
      <option value="MONTHLY">{cadenceLabels.MONTHLY}</option><option value="YEARLY">{cadenceLabels.YEARLY}</option>
    </select></label>
    <label>Tarikh bil seterusnya<input name="nextDueOn" type="date" defaultValue={bill?.nextDueOn ?? today} min="2000-01-01" max="2100-12-31" required /></label>
    <label>Status<select name="active" defaultValue={bill?.active === false ? "no" : "yes"}>
      <option value="yes">Aktif</option><option value="no">Dijeda</option>
    </select></label>
  </>;
}

export default async function BillsPage() {
  const user = await requirePageUser();
  const today = todayInMalaysia();
  const [categories, bills] = await Promise.all([listCategories(user.id), listBills(user.id)]);
  return <>
    <Link className="text-link" href="/dashboard">← Dashboard</Link>
    <h1 className="account-title">Bil berulang</h1>
    <section className="account-card" aria-labelledby="add-bill-heading">
      <h2 id="add-bill-heading">Tambah bil</h2>
      {categories.some((category) => category.transactionType === "EXPENSE") ?
        <MutationForm operation="createBill" label="Tambah bil"><BillFields categories={categories} today={today} /></MutationForm> :
        <p><Link className="text-link" href="/categories">Tambah kategori perbelanjaan dahulu</Link></p>}
    </section>
    <section id="senarai" aria-labelledby="bills-list-heading">
      <h2 className="section-title" id="bills-list-heading">Bil anda</h2>
      {bills.length ? <div className="account-grid">{bills.map((bill) =>
        <section className="account-card" key={bill.id} aria-label={`Bil ${bill.name}`}>
          <h3>{bill.name}</h3>
          <p><strong>{formatMyr(bill.amount)}</strong> · {cadenceLabels[bill.cadence]} · {bill.categoryName}</p>
          <p>{bill.active ? "Bayaran seterusnya" : "Dijeda"} · <time dateTime={bill.nextDueOn}>{displayDate(bill.nextDueOn)}</time>
            {bill.active && bill.nextDueOn < today && <strong className="budget-warning"> · Tertunggak</strong>}
          </p>
          {bill.active && <Link className="inline-link" href={`/bills/${bill.id}/payment`}>Rekod bayaran</Link>}
          <details><summary>Ubah bil</summary><MutationForm operation="updateBill" id={bill.id} version={bill.version}>
            <BillFields categories={categories} today={today} bill={bill} />
          </MutationForm></details>
          <MutationForm operation="deleteBill" id={bill.id} version={bill.version} label="Padam bil" destructive />
        </section>)}</div> : <p className="empty-state">Belum ada bil berulang.</p>}
    </section>
  </>;
}
