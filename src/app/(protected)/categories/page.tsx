import { requirePageUser } from "@/lib/auth/session";
import { listCategories } from "@/lib/finance/dal";
import { MutationForm } from "@/components/finance/mutation-form";

export const metadata = { title: "Kategori — DuitFlow" };

function Fields({ name = "", type = "EXPENSE" }: { name?: string; type?: string }) {
  return <><label>Nama kategori<input name="name" defaultValue={name} maxLength={80} required /></label><label>Jenis kategori<select name="transactionType" defaultValue={type}><option value="EXPENSE">Perbelanjaan</option><option value="INCOME">Pendapatan</option></select></label></>;
}

export default async function CategoriesPage() {
  const user = await requirePageUser();
  const categories = await listCategories(user.id);
  return <>
    <p className="kicker">SUSUN REKOD ANDA</p><h1 className="account-title">Kategori</h1>
    <p>Kategori yang digunakan oleh transaksi atau bajet mesti dikosongkan dahulu sebelum dipadam atau ditukar jenis.</p>
    <section className="account-card"><h2>Tambah kategori</h2><MutationForm operation="createCategory" label="Tambah kategori"><Fields /></MutationForm></section>
    {categories.length > 0 && <div className="account-grid">{(["EXPENSE", "INCOME"] as const).map((type) => {
      const group = categories.filter((category) => category.transactionType === type);
      return <section className="account-card" key={type}><h2>{type === "INCOME" ? "Pendapatan" : "Perbelanjaan"}</h2>
        {group.length === 0 && <p>Belum ada kategori.</p>}
        {group.map((category) => <section key={category.id} aria-label={`Kategori ${category.name}`}>
          <details className="category-editor"><summary>{category.name}</summary>
            <MutationForm operation="updateCategory" id={category.id}><Fields name={category.name} type={category.transactionType} /></MutationForm>
            <MutationForm operation="deleteCategory" id={category.id} label="Padam kategori" destructive />
          </details>
        </section>)}
      </section>;
    })}</div>}
    {!categories.length && <p>Belum ada kategori. Tambah satu untuk mula merekod.</p>}
  </>;
}
