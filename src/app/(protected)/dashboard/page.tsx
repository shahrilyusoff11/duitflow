import { requirePageUser } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/auth/profile";

export const metadata = { title: "Ruang anda — DuitFlow" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const profile = await getUserProfile(user.id);
  return <>
    <p className="kicker">RUANG PERIBADI ANDA</p>
    <h1 className="account-title">Selamat datang,<br /><span>{profile.name}.</span></h1>
    <p className="auth-description">Kategori peribadi anda telah disediakan untuk membantu menyusun rekod kewangan anda.</p>
    <div className="account-grid">
      <section className="account-card" aria-labelledby="categories-title">
        <p className="kicker">MULA DENGAN LEBIH TERATUR</p>
        <h2 id="categories-title">Kategori anda</h2>
        {(["EXPENSE", "INCOME"] as const).map((type) => <div key={type} className="category-group">
          <h3>{type === "EXPENSE" ? "Perbelanjaan" : "Pendapatan"}</h3>
          <ul className="category-list">{profile.categories.filter((category) => category.transactionType === type).map((category) => <li key={category.id}>{category.name}</li>)}</ul>
        </div>)}
      </section>
      <section className="account-card" aria-labelledby="account-title">
        <p className="kicker">AKAUN</p><h2 id="account-title">Maklumat anda</h2>
        <dl className="profile-details"><dt>Nama</dt><dd>{profile.name}</dd><dt>E-mel</dt><dd>{profile.email}</dd><dt>Penghuraian AI</dt><dd>{profile.aiParsingEnabled ? "Aktif" : "Tidak aktif"}</dd></dl>
        <p className="auth-note">Penghuraian AI memerlukan persetujuan anda sebelum digunakan.</p>
      </section>
    </div>
  </>;
}
