"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";

const links = [
  ["/dashboard", "Dashboard", "overview"], ["/transactions", "Transaksi", "net"],
  ["/budgets", "Bajet", "chart"], ["/categories", "Kategori", "tag"], ["/settings", "Tetapan", "settings"],
] as const;

export function FinanceNavigation() {
  const pathname = usePathname();
  return <nav className="finance-nav app-nav wrap" aria-label="Navigasi kewangan">
    {links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}><Icon name={icon} size={16} />{label}</Link>)}
  </nav>;
}
