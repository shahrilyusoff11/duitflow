import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { getBill } from "@/lib/finance/dal";
import { displayDate, todayInMalaysia } from "@/lib/finance/dates";
import { idSchema } from "@/lib/finance/validation";
import { MutationForm } from "@/components/finance/mutation-form";
import { TransactionDetailsFields } from "@/components/finance/views";

export const metadata = { title: "Rekod bayaran — DuitFlow" };

export default async function BillPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const bill = await getBill(user.id, id.data);
  if (!bill?.active) notFound();
  return <>
    <Link className="text-link" href="/bills">← Bil berulang</Link>
    <h1 className="account-title">Rekod bayaran</h1>
    <section className="account-card" aria-labelledby="payment-heading">
      <h2 id="payment-heading">{bill.name}</h2>
      <p>Tarikh bil <time dateTime={bill.nextDueOn}>{displayDate(bill.nextDueOn)}</time> · {bill.categoryName}</p>
      <p>Semak amaun dan tarikh bayaran sebenar. Pengesahan ini menambah satu perbelanjaan dan mengemas kini tarikh bil seterusnya.</p>
      <MutationForm operation="recordBillPayment" id={bill.id} version={bill.version} label="Sahkan bayaran">
        <TransactionDetailsFields value={{ amount: bill.amount, description: bill.name, occurredOn: todayInMalaysia() }} />
      </MutationForm>
    </section>
  </>;
}
