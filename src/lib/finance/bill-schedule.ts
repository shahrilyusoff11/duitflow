import type { BillCadence } from "@/generated/prisma/client";

type BillSchedule = {
  cadence: BillCadence; nextDueOn: Date; dayOfMonth: number;
  paymentLimit?: number | null; endsOn?: Date | null; paymentsMade?: number; completed?: boolean;
};

export function billDueDate({ cadence, nextDueOn, dayOfMonth }: BillSchedule, occurrence = 0): Date {
  if (occurrence === 0) return new Date(nextDueOn);
  const monthOffset = occurrence * (cadence === "YEARLY" ? 12 : 1);
  const year = nextDueOn.getUTCFullYear();
  const month = nextDueOn.getUTCMonth() + monthOffset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(lastDay, dayOfMonth)));
}

function hasOccurrence(bill: BillSchedule, occurrence: number, due: Date) {
  return !bill.completed && due.getUTCFullYear() <= 2100 && (!bill.endsOn || due <= bill.endsOn)
    && (bill.paymentLimit == null || (bill.paymentsMade ?? 0) + occurrence < bill.paymentLimit);
}

export function billAfterPayment(bill: BillSchedule & { paymentsMade: number }) {
  const nextDueOn = billDueDate(bill, 1);
  const paymentsMade = bill.paymentsMade + 1;
  return hasOccurrence(bill, 1, nextDueOn)
    ? { nextDueOn, paymentsMade, completed: false, active: true }
    : { nextDueOn: bill.nextDueOn, paymentsMade, completed: true, active: false };
}

export function billScheduleLabel(bill: {
  cadence: BillCadence; paymentLimit: number | null; endsOn: string | null; paymentsMade: number;
}) {
  if (bill.paymentLimit === 1) return "Sekali bayar";
  if (bill.paymentLimit !== null) return `Ansuran · ${bill.paymentsMade}/${bill.paymentLimit} dibayar`;
  if (bill.endsOn) return `Ansuran hingga ${bill.endsOn} · ${bill.paymentsMade} dibayar`;
  return bill.cadence === "YEARLY" ? "Setiap tahun" : "Setiap bulan";
}

export function billsDueBetween(bill: BillSchedule, start: Date, end: Date): Date[] {
  const monthsSinceFirst = (start.getUTCFullYear() - bill.nextDueOn.getUTCFullYear()) * 12 + start.getUTCMonth() - bill.nextDueOn.getUTCMonth();
  let occurrence = Math.max(0, Math.floor(monthsSinceFirst / (bill.cadence === "YEARLY" ? 12 : 1)));
  let due = billDueDate(bill, occurrence);
  if (due < start) due = billDueDate(bill, ++occurrence);
  const dates = [];
  while (due < end && hasOccurrence(bill, occurrence, due)) {
    dates.push(due);
    due = billDueDate(bill, ++occurrence);
  }
  return dates;
}
