// The versioned User INSERT trigger seeds these inside the signup transaction.
// No globals, nullable owner IDs, or public mutation/seed endpoint.
export const defaultCategories = [
  { name: "Makanan & Minuman", transactionType: "EXPENSE" },
  { name: "Pengangkutan", transactionType: "EXPENSE" },
  { name: "Bil & Utiliti", transactionType: "EXPENSE" },
  { name: "Keperluan Rumah", transactionType: "EXPENSE" },
  { name: "Kesihatan", transactionType: "EXPENSE" },
  { name: "Hiburan", transactionType: "EXPENSE" },
  { name: "Lain-lain", transactionType: "EXPENSE" },
  { name: "Gaji", transactionType: "INCOME" },
  { name: "Pendapatan Sampingan", transactionType: "INCOME" },
  { name: "Lain-lain", transactionType: "INCOME" },
] as const;
