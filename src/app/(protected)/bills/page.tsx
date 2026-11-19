import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { listBills, listCategories } from "@/lib/finance/dal";
import { displayDate, todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { billScheduleLabel } from "@/lib/finance/bill-schedule";
import { MutationForm } from "@/components/finance/mutation-form";
import { CategorySelect, type Categories } from "@/components/finance/views";
import { Icon } from "@/components/icon";
import "./bills.css";

export const metadata = { title: "Bil dan ansuran — DuitFlow" };

type Bill = Awaited<ReturnType<typeof listBills>>[number];
const cadenceLabels = { MONTHLY: "Setiap bulan", YEARLY: "Setiap tahun" };

function BillFields({ categories, today, bill }: { categories: Categories; today: string; bill?: Bill }) {
  return <>
    <label>Nama bil<input name="name" defaultValue={bill?.name} maxLength={80} required /></label>
    <label>Amaun (MYR)<input name="amount" inputMode="decimal" defaultValue={bill?.amount} placeholder="RM129.00" maxLength={80} required /></label>
    <CategorySelect categories={categories} value={bill?.categoryId} expenseOnly />
    <label>Tarikh bil seterusnya<input name="nextDueOn" type="date" defaultValue={bill?.nextDueOn ?? today} min="2000-01-01" max={bill?.endsOn ?? "2100-12-31"} required /></label>
    {bill && (bill.paymentLimit || bill.endsOn) ? <input type="hidden" name="cadence" value={bill.cadence} /> : <label className="bill-short-field">Kekerapan<select name="cadence" defaultValue={bill?.cadence ?? "MONTHLY"}>
      <option value="MONTHLY">{cadenceLabels.MONTHLY}</option><option value="YEARLY">{cadenceLabels.YEARLY}</option>
    </select></label>}
    <label className="bill-short-field">Status<select name="active" defaultValue={bill?.active === false ? "no" : "yes"}>
      <option value="yes">Aktif</option><option value="no">Dijeda</option>
    </select></label>
  </>;
}

export default async function BillsPage() {
  const user = await requirePageUser();
  const today = todayInMalaysia();
  const [categories, bills] = await Promise.all([listCategories(user.id), listBills(user.id)]);
  const groups = [
    { id: "tertunggak", title: "Tertunggak", rows: bills.filter((bill) => bill.active && bill.nextDueOn < today) },
    { id: "dijadualkan", title: "Dijadualkan", rows: bills.filter((bill) => bill.active && bill.nextDueOn >= today) },
    { id: "dijeda", title: "Dijeda", rows: bills.filter((bill) => !bill.active && !bill.completed) },
    { id: "selesai", title: "Selesai", rows: bills.filter((bill) => bill.completed) },
  ];

  return <>
    <header className="workspace-heading">
      <h1 className="account-title">Bil dan ansuran</h1>
      <a className="button" href="#tambah-bil"><Icon name="plus" size={17} />Tambah bil</a>
    </header>
    <div className="manage-layout">
      <div className="manage-records" id="senarai">
        {bills.length ? <div className="account-card bill-list">
          {groups.filter((group) => group.rows.length > 0).flatMap((group) => [
            <h2 className="bill-group-heading" key={group.id} id={group.id}>{group.title}</h2>,
            ...group.rows.map((bill) => <section key={bill.id} className="bill-record" aria-label={`Bil ${bill.name}`}>
              <div className="bill-record-heading">
                <div>
                  <h3>{bill.name}</h3>
                  <p>{bill.categoryName} · {billScheduleLabel(bill)}</p>
                </div>
                <strong>{formatMyr(bill.amount)}</strong>
              </div>
              <div className="bill-record-actions">
                <p>{bill.completed ? "Tarikh bil terakhir" : "Tarikh bil"} <time dateTime={bill.nextDueOn}>{displayDate(bill.nextDueOn)}</time></p>
                {bill.active && <Link className="quiet-button" href={`/bills/${bill.id}/payment`}>Rekod bayaran <Icon name="arrow" size={15} /></Link>}
              </div>
              <details className="bill-editor">
                <summary>{bill.completed ? "Urus bil selesai" : "Ubah bil"}</summary>
                {!bill.completed && <MutationForm operation="updateBill" id={bill.id} version={bill.version}>
                  <BillFields categories={categories} today={today} bill={bill} />
                </MutationForm>}
                <MutationForm operation="deleteBill" id={bill.id} version={bill.version} label="Padam bil" destructive />
              </details>
            </section>),
          ])}
        </div> : <section className="account-card"><h2>Bil anda</h2><p>Belum ada bil.</p></section>}
      </div>
      <section className="account-card manage-create bill-create" id="tambah-bil" tabIndex={-1} aria-labelledby="add-bill-heading">
        <h2 id="add-bill-heading">Tambah bil</h2>
        {categories.some((category) => category.transactionType === "EXPENSE") ?
          <MutationForm operation="createBill" label="Tambah bil"><BillFields categories={categories} today={today} /></MutationForm> :
          <p><Link className="text-link" href="/categories">Tambah kategori perbelanjaan dahulu</Link></p>}
      </section>
    </div>
  </>;
}
