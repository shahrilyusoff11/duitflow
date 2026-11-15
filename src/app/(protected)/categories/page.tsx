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
    <div className="account-grid">{categories.map((category) => <section className="account-card" key={category.id} aria-label={`Kategori ${category.name}`}>
      <h2>{category.name}</h2><MutationForm operation="updateCategory" id={category.id}><Fields name={category.name} type={category.transactionType} /></MutationForm>
      <MutationForm operation="deleteCategory" id={category.id} label="Padam kategori" destructive />
    </section>)}</div>
    {!categories.length && <p>Belum ada kategori. Tambah satu untuk mula merekod.</p>}
  </>;
}
