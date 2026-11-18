"use client";

import Link from "next/link";
import { useState } from "react";
import type { Categories } from "./views";

type TransactionType = Categories[number]["transactionType"];

export function TypeCategoryFields({ categories, initialType, initialCategory = "", filter = false }: {
  categories: Categories;
  initialType: TransactionType | "";
  initialCategory?: string;
  filter?: boolean;
}) {
  const [type, setType] = useState(initialType);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const choices = categories.filter((category) => !type || category.transactionType === type);
  const selectedId = choices.some((category) => category.id === categoryId) ? categoryId : "";

  function changeType(next: string) {
    if (next !== "" && next !== "INCOME" && next !== "EXPENSE") return;
    setType(next);
    if (next && !categories.some((category) => category.id === selectedId && category.transactionType === next)) {
      setCategoryId("");
    }
  }

  return <>
    <label>Jenis<select name="type" value={type} onChange={(event) => changeType(event.target.value)}>
      {filter && <option value="">Semua jenis</option>}
      <option value="EXPENSE">Perbelanjaan</option><option value="INCOME">Pendapatan</option>
    </select></label>
    <label>Kategori<select name="categoryId" value={selectedId} required={!filter} onChange={(event) => setCategoryId(event.target.value)}>
      <option value="" disabled={!filter}>{filter ? "Semua kategori" : "Pilih kategori"}</option>
      {choices.map((category) => <option key={category.id} value={category.id}>
        {type ? category.name : `${category.name} (${category.transactionType === "INCOME" ? "Pendapatan" : "Perbelanjaan"})`}
      </option>)}
    </select></label>
    {!filter && choices.length === 0 && <p className="category-help">Belum ada kategori untuk jenis ini. <Link className="text-link" href="/categories">Tambah kategori</Link></p>}
  </>;
}
