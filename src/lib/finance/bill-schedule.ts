import type { BillCadence } from "@/generated/prisma/client";

type BillSchedule = { cadence: BillCadence; nextDueOn: Date; dayOfMonth: number };

export function billDueDate({ cadence, nextDueOn, dayOfMonth }: BillSchedule, occurrence = 0): Date {
  const monthOffset = occurrence * (cadence === "YEARLY" ? 12 : 1);
  const year = nextDueOn.getUTCFullYear();
  const month = nextDueOn.getUTCMonth() + monthOffset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(lastDay, dayOfMonth)));
}

export function billsDueBetween(bill: BillSchedule, start: Date, end: Date): Date[] {
  const monthsSinceFirst = (start.getUTCFullYear() - bill.nextDueOn.getUTCFullYear()) * 12 + start.getUTCMonth() - bill.nextDueOn.getUTCMonth();
  let occurrence = Math.max(0, Math.floor(monthsSinceFirst / (bill.cadence === "YEARLY" ? 12 : 1)));
  let due = billDueDate(bill, occurrence);
  if (due < start) due = billDueDate(bill, ++occurrence);
  const dates = [];
  while (due < end && due.getUTCFullYear() <= 2100) {
    dates.push(due);
    due = billDueDate(bill, ++occurrence);
  }
  return dates;
}
