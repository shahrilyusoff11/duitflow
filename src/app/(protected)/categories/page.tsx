import { requirePageUser } from "@/lib/auth/session";
import { listCategories } from "@/lib/finance/dal";
import { MutationForm } from "@/components/finance/mutation-form";
import { Icon } from "@/components/icon";

export const metadata = { title: "Kategori — DuitFlow" };

function Fields({ name = "", type = "EXPENSE" }: { name?: string; type?: string }) {
  return <><label>Nama kategori<input name="name" defaultValue={name} maxLength={80} required /></label><label>Jenis kategori<select name="transactionType" defaultValue={type}><option value="EXPENSE">Perbelanjaan</option><option value="INCOME">Pendapatan</option></select></label></>;
}

export default async function CategoriesPage() {
  const user = await requirePageUser();
  const categories = await listCategories(user.id);
  return <>
    <header className="workspace-heading">
      <h1 className="account-title">Kategori</h1>
      <a className="button" href="#tambah-kategori"><Icon name="plus" size={17} />Tambah kategori</a>
    </header>
    <div className="manage-layout">
      <div className="manage-records">
        {(["EXPENSE", "INCOME"] as const).map((type) => {
          const group = categories.filter((category) => category.transactionType === type);
          const title = type === "INCOME" ? "Pendapatan" : "Perbelanjaan";
          return <section className="account-card" key={type} aria-label={title}>
            <h2>{title}</h2>
            {group.length ? group.map((category) => <section key={category.id} aria-label={`Kategori ${category.name}`}>
              <details className="category-editor"><summary>{category.name}</summary>
                <MutationForm operation="updateCategory" id={category.id}><Fields name={category.name} type={category.transactionType} /></MutationForm>
                <MutationForm operation="deleteCategory" id={category.id} label="Padam kategori" destructive />
              </details>
            </section>) : <p>Belum ada kategori.</p>}
          </section>;
        })}
      </div>
      <section className="account-card manage-create" id="tambah-kategori" tabIndex={-1}>
        <h2>Tambah kategori</h2>
        <MutationForm operation="createCategory" label="Tambah kategori"><Fields /></MutationForm>
      </section>
    </div>
  </>;
}
