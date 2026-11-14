import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/auth-buttons";
import { userFromHeaders } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/config/auth";

export const metadata = { title: "Log masuk — DuitFlow" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await userFromHeaders(await headers())) redirect("/dashboard");
  const available = isAuthConfigured(process.env);
  const { error } = await searchParams;
  return <main className="auth-screen">
    <Link className="brand" href="/">DuitFlow<span className="brand-dot">.</span></Link>
    <section className="auth-card" aria-labelledby="signin-title">
      <p className="kicker">SELAMAT DATANG</p>
      <h1 id="signin-title">Ruang anda,<br /><span>lebih teratur.</span></h1>
      <p className="auth-description">Log masuk atau cipta akaun menggunakan GitHub untuk mengakses ruang kewangan peribadi anda.</p>
      {error && <p className="notice" role="alert">Log masuk tidak berjaya. Sila cuba lagi.</p>}
      {!available && <p className="notice" role="status">Log masuk belum tersedia. Sila cuba lagi sebentar.</p>}
      <SignInButton available={available} />
      <p className="auth-note">DuitFlow tidak meminta kata laluan GitHub anda. Pengesahan dilakukan melalui GitHub.</p>
      <Link className="text-link" href="/">← Kembali ke halaman utama</Link>
    </section>
    <p className="auth-note">Direka untuk rutin harian di Malaysia.</p>
  </main>;
}
