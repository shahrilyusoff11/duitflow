import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { listBudgets, listCategories } from "@/lib/finance/dal";
import { invalidFiltersMessage, selectedMonth, type SearchParams } from "@/lib/finance/page-params";
import { MutationForm } from "@/components/finance/mutation-form";
import { BudgetStatus, CategorySelect, type Categories, MonthPicker } from "@/components/finance/views";
import { Icon } from "@/components/icon";

export const metadata = { title: "Bajet — DuitFlow" };

function Fields({ categories, period, value }: { categories: Categories; period: string; value?: { categoryId: string; limitAmount: string; warningAt: number } }) {
  return <><CategorySelect categories={categories} value={value?.categoryId} expenseOnly /><label>Bulan bajet<input name="period" type="month" defaultValue={period} min="2000-01" max="2100-12" required /></label><label>Had (MYR)<input name="limitAmount" inputMode="decimal" defaultValue={value?.limitAmount} maxLength={80} placeholder="RM500" required /></label><label>Ambang amaran (%)<input name="warningAt" type="number" min={1} max={99} defaultValue={value?.warningAt ?? 80} required /></label></>;
}

export default async function BudgetsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const period = selectedMonth((await searchParams).month);
  if (!period) return <p role="alert">{invalidFiltersMessage} <Link href="/budgets">Tetapkan semula</Link></p>;
  const [categories, budgets] = await Promise.all([listCategories(user.id), listBudgets(user.id, period)]);
  return <>
    <header className="workspace-heading">
      <h1 className="account-title">Bajet bulanan</h1>
      <div className="workspace-tools">
        <MonthPicker key={period} period={period} />
        <a className="button" href="#tambah-bajet"><Icon name="plus" size={17} />Tambah bajet</a>
      </div>
    </header>
    <div className="manage-layout">
      <div className="manage-records">
        {budgets.length ? budgets.map((budget) => (
          <section className="account-card" key={budget.id} aria-label={`Bajet ${budget.categoryName}`}>
            <h2>{budget.categoryName}</h2>
            <BudgetStatus budget={budget} />
            <details><summary>Ubah bajet</summary>
              <MutationForm operation="updateBudget" id={budget.id}><Fields categories={categories} period={period} value={budget} /></MutationForm>
            </details>
            <MutationForm operation="deleteBudget" id={budget.id} label="Padam bajet" destructive />
          </section>
        )) : <section className="account-card"><h2>Bajet anda</h2><p>Belum ada bajet bagi bulan yang dipilih.</p></section>}
      </div>
      <section className="account-card manage-create" id="tambah-bajet" tabIndex={-1}>
        <h2>Tambah bajet</h2>
        {categories.some((row) => row.transactionType === "EXPENSE") ? (
          <MutationForm key={period} operation="createBudget" label="Tambah bajet"><Fields categories={categories} period={period} /></MutationForm>
        ) : <p><Link className="text-link" href="/categories">Tambah kategori perbelanjaan dahulu</Link></p>}
      </section>
    </div>
  </>;
}
