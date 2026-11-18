import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { listCategories, listTransactions } from "@/lib/finance/dal";
import { filterSchema } from "@/lib/finance/validation";
import { invalidFiltersMessage, type SearchParams } from "@/lib/finance/page-params";
import { MutationForm } from "@/components/finance/mutation-form";
import { TransactionFields } from "@/components/finance/views";
import { TypeCategoryFields } from "@/components/finance/type-category-fields";
import { TransactionLedger } from "@/components/finance/transaction-ledger";
import { Icon } from "@/components/icon";
import "./transactions.css";

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
  const filtered = Boolean(filters.type || filters.categoryId || filters.from || filters.to || filters.search);
  if (filters.categoryId && !categories.some((category) => category.id === filters.categoryId && (!filters.type || category.transactionType === filters.type))) {
    return <p role="alert">{invalidFiltersMessage} <Link className="text-link" href="/transactions">Tetapkan semula</Link></p>;
  }
  return <>
    <header className="transactions-title"><h1 className="account-title">Transaksi</h1><a className="inline-link" href="#rekod">Lihat rekod <Icon name="down" size={16} /></a></header>
    <div className="transactions-layout">
      <section className="transaction-entry" id="tambah" aria-labelledby="entry-heading">
        <header><span className="entry-icon"><Icon name="book" size={20} /></span><h2 id="entry-heading">Tambah transaksi</h2></header>
        {categories.length ? <MutationForm operation="createTransaction" label="Tambah transaksi"><TransactionFields categories={categories} /></MutationForm> :
          <p className="entry-no-categories"><Link className="text-link" href="/categories">Tambah kategori dahulu</Link></p>}
      </section>
      <section className="transaction-records" id="rekod" aria-labelledby="records-heading">
        <header className="records-heading"><h2 id="records-heading">Rekod anda</h2><span>{result.total} rekod</span></header>
        <details className="record-filters" key={pageHref(result.page)} open={filtered || undefined}>
          <summary><Icon name="settings" size={17} />Cari dan tapis <Icon name="chevron" size={15} /></summary>
          <form className="filter-form" method="get">
            <label className="record-search">Cari keterangan<input name="search" type="search" defaultValue={filters.search} maxLength={100} /></label>
            <TypeCategoryFields categories={categories} initialType={filters.type ?? ""} initialCategory={filters.categoryId} filter />
            <label>Dari<input name="from" type="date" defaultValue={filters.from} /></label>
            <label>Hingga<input name="to" type="date" defaultValue={filters.to} /></label>
            <div className="filter-actions"><button className="button">Tapis</button><Link className="inline-link" href="/transactions">Tetapkan semula</Link></div>
          </form>
        </details>
        {result.rows.length ? <TransactionLedger rows={result.rows} /> :
          <div className="records-empty"><Icon name="book" size={26} /><p>{filtered ? "Tiada transaksi sepadan dengan penapis anda." : "Belum ada transaksi pada halaman ini."}</p>
            {filtered && <Link className="text-link" href="/transactions">Papar semua transaksi</Link>}
          </div>}
        {(result.page > 1 || result.total > result.pageSize) && <nav className="records-pages" aria-label="Halaman transaksi">
          <span>Halaman {result.page}</span>
          {result.page > 1 && <Link href={pageHref(result.page - 1)}>Sebelumnya</Link>}
          {result.page * result.pageSize < result.total && <Link href={pageHref(result.page + 1)}>Seterusnya</Link>}
        </nav>}
      </section>
    </div>
  </>;
}
