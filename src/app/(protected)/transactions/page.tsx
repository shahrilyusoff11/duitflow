import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { listCategories, listTransactions } from "@/lib/finance/dal";
import { filterSchema } from "@/lib/finance/validation";
import { invalidFiltersMessage, type SearchParams } from "@/lib/finance/page-params";
import { MutationForm } from "@/components/finance/mutation-form";
import { TransactionFields, TransactionsList } from "@/components/finance/views";

export const metadata = { title: "Transaksi — DuitFlow" };

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const parsed = filterSchema.safeParse(Object.fromEntries(["from", "to", "type", "categoryId", "search", "page"].filter((key) => params[key] !== undefined && params[key] !== "").map((key) => [key, params[key]])));
  if (!parsed.success) return <p role="alert">{invalidFiltersMessage} <Link className="text-link" href="/transactions">Tetapkan semula</Link></p>;
  const filters = parsed.data;
  const [categories, result] = await Promise.all([listCategories(user.id), listTransactions(user.id, filters)]);
  const pageHref = (page: number) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([key]) => key !== "pageSize").map(([key, value]) => [key, String(value)]));
    query.set("page", String(page));
    return `/transactions?${query}`;
  };
  return <>
    <p className="kicker">PENDAPATAN & PERBELANJAAN</p><h1 className="account-title">Transaksi</h1>
    <section className="account-card"><h2>Tambah transaksi</h2>{categories.length ? <MutationForm operation="createTransaction" label="Tambah transaksi"><TransactionFields categories={categories} /></MutationForm> : <p><Link className="text-link" href="/categories">Tambah kategori dahulu</Link></p>}</section>
    <section className="account-card"><h2>Rekod anda</h2>
      <form className="filter-form" method="get">
        <label>Dari<input name="from" type="date" defaultValue={filters.from} /></label><label>Hingga<input name="to" type="date" defaultValue={filters.to} /></label>
        <label>Jenis<select name="type" defaultValue={filters.type ?? ""}><option value="">Semua jenis</option><option value="INCOME">Pendapatan</option><option value="EXPENSE">Perbelanjaan</option></select></label>
        <label>Kategori<select name="categoryId" defaultValue={filters.categoryId ?? ""}><option value="">Semua kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Cari keterangan<input name="search" defaultValue={filters.search} maxLength={100} /></label><button className="button">Tapis</button><Link className="text-link" href="/transactions">Tetapkan semula</Link>
      </form>
      <p>{result.total} rekod · Halaman {result.page}</p><TransactionsList rows={result.rows} />
      <nav className="pagination" aria-label="Halaman transaksi">{result.page > 1 && <Link className="text-link" href={pageHref(result.page - 1)}>Sebelumnya</Link>}{result.page * result.pageSize < result.total && <Link className="text-link" href={pageHref(result.page + 1)}>Seterusnya</Link>}</nav>
    </section>
  </>;
}
