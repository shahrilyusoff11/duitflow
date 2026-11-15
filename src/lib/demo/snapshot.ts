import "server-only";
import { budgetProgress, Decimal } from "@/lib/finance/money";

// Public, invented portfolio examples only. This module never reads a session,
// database, user input or provider configuration.
const period = "2026-11";
const records = [
  { occurredOn: "2026-11-15", description: "Nasi ayam contoh", categoryName: "Makanan", type: "EXPENSE", amount: "12.50", source: "TELEGRAM" },
  { occurredOn: "2026-11-14", description: "Kopi contoh", categoryName: "Makanan", type: "EXPENSE", amount: "8.00", source: "TELEGRAM" },
  { occurredOn: "2026-11-13", description: "Petrol contoh", categoryName: "Pengangkutan", type: "EXPENSE", amount: "75.00", source: "WEB" },
  { occurredOn: "2026-11-10", description: "Barang dapur contoh", categoryName: "Makanan", type: "EXPENSE", amount: "360.00", source: "WEB" },
  { occurredOn: "2026-11-07", description: "Kerja sambilan contoh", categoryName: "Pendapatan lain", type: "INCOME", amount: "240.00", source: "WEB" },
  { occurredOn: "2026-11-05", description: "Bil utiliti contoh", categoryName: "Bil", type: "EXPENSE", amount: "120.00", source: "WEB" },
  { occurredOn: "2026-11-04", description: "Bekalan makanan contoh", categoryName: "Makanan", type: "EXPENSE", amount: "60.00", source: "WEB" },
  { occurredOn: "2026-11-01", description: "Gaji contoh", categoryName: "Gaji", type: "INCOME", amount: "3500.00", source: "WEB" },
] as const;

const priorMonths = [
  { month: "2026-06", income: "3200.00", expense: "1840.30" },
  { month: "2026-07", income: "3500.00", expense: "2100.00" },
  { month: "2026-08", income: "3500.00", expense: "1950.75" },
  { month: "2026-09", income: "3650.00", expense: "2270.10" },
  { month: "2026-10", income: "3500.00", expense: "2030.50" },
];

export function getDemoSnapshot() {
  const sum = (type: "INCOME" | "EXPENSE") => records
    .filter((record) => record.type === type)
    .reduce((total, record) => total.plus(record.amount), new Decimal(0));
  const income = sum("INCOME");
  const expense = sum("EXPENSE");
  const categorySpend = (name: string) => records
    .filter((record) => record.type === "EXPENSE" && record.categoryName === name)
    .reduce((total, record) => total.plus(record.amount), new Decimal(0)).toFixed(2);

  return {
    period,
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    net: income.minus(expense).toFixed(2),
    records,
    breakdown: ["Makanan", "Bil", "Pengangkutan"].map((name) => ({ name, amount: categorySpend(name) })),
    trend: [...priorMonths, { month: period, income: income.toFixed(2), expense: expense.toFixed(2) }],
    budgets: [
      { categoryName: "Makanan", limitAmount: "500.00" },
      { categoryName: "Pengangkutan", limitAmount: "200.00" },
      { categoryName: "Bil", limitAmount: "100.00" },
    ].map((budget) => {
      const spent = categorySpend(budget.categoryName);
      return {
        ...budget, id: `sample-${budget.categoryName}`, categoryId: `sample-${budget.categoryName}`,
        period, spent, warningAt: 80, ...budgetProgress(spent, budget.limitAmount, 80),
      };
    }),
  };
}
