"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/dashboard", "Dashboard"], ["/transactions", "Transaksi"],
  ["/budgets", "Bajet"], ["/categories", "Kategori"], ["/settings", "Tetapan"],
] as const;

export function FinanceNavigation() {
  const pathname = usePathname();
  return <nav className="finance-nav wrap" aria-label="Navigasi kewangan">
    {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
