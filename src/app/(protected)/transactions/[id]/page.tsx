import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";
import { FinanceError, getTransaction, listCategories } from "@/lib/finance/dal";
import { displayDate } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { MutationForm } from "@/components/finance/mutation-form";
import { TransactionFields } from "@/components/finance/views";

export const metadata = { title: "Butiran transaksi — DuitFlow" };

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let transaction;
  try { transaction = await getTransaction(user.id, id); }
  catch (error) { if (error instanceof FinanceError && error.code === "NOT_FOUND") notFound(); throw error; }
  const categories = await listCategories(user.id);
  return <>
    <Link className="text-link" href="/transactions">← Semua transaksi</Link><h1 className="account-title">Butiran transaksi</h1>
    <section className="account-card"><h2>{transaction.description}</h2><p>{formatMyr(transaction.amount)} · {displayDate(transaction.occurredOn)} · {transaction.categoryName}</p>
      <p>Sumber: {transaction.source === "WEB" ? "Web" : "Telegram"}</p>
      <p>Dicipta: <time dateTime={transaction.createdAt}>{new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(transaction.createdAt))}</time></p>
      <MutationForm operation="updateTransaction" id={transaction.id} label="Simpan transaksi"><TransactionFields categories={categories} value={transaction} /></MutationForm>
      <MutationForm operation="deleteTransaction" id={transaction.id} label="Padam transaksi" destructive />
    </section>
  </>;
}
