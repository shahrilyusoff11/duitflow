import "server-only";
import type { Prisma, Transaction } from "@/generated/prisma/client";
import { parseDate } from "./dates";
import { Decimal } from "./money";
import { billAfterPayment } from "./bill-schedule";
import type { billPaymentSchema } from "./validation";
import type { z } from "zod";

type Tx = Prisma.TransactionClient;
type Receipt = Pick<Transaction, "billId" | "billDueOn" | "billPaidVersion" | "paymentTrackingKnown">;

// Call inside the same transaction that claims the web form or Telegram action.
export async function saveBillPayment(
  tx: Tx, userId: string, billId: string, version: number, payment: z.output<typeof billPaymentSchema>,
  source: Transaction["source"], expectedDue?: string,
) {
  const where = { id: billId, userId, active: true, version, ...(expectedDue ? { nextDueOn: parseDate(expectedDue) } : {}) };
  const bill = await tx.recurringBill.findFirst({ where });
  if (!bill) return null;
  const schedule = billAfterPayment(bill);
  const claimed = await tx.recurringBill.updateMany({ where, data: { ...schedule, version: { increment: 1 } } });
  if (!claimed.count) return null;
  const record = await tx.transaction.create({
    data: {
      ...payment, userId, source, categoryId: bill.categoryId, type: "EXPENSE",
      amount: new Decimal(payment.amount), occurredOn: parseDate(payment.occurredOn),
      billId, billDueOn: bill.nextDueOn, billPaidVersion: version + 1,
    },
    include: { category: { select: { name: true } } },
  });
  return { record, nextDueOn: schedule.active ? schedule.nextDueOn : null };
}

export async function lockLedgerRecord(tx: Tx, userId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Transaction" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  return rows.length ? tx.transaction.findFirst({ where: { userId, id } }) : null;
}

export async function getBillRestoration(tx: Tx, userId: string, record: Receipt) {
  if (!record.paymentTrackingKnown) return { kind: "LEGACY" as const };
  if (!record.billId || !record.billDueOn || record.billPaidVersion === null) return { kind: "ORDINARY" as const };
  const bill = await tx.recurringBill.findFirst({
    where: { id: record.billId, userId, version: record.billPaidVersion, paymentsMade: { gt: 0 } },
    select: { id: true, name: true, version: true },
  });
  return bill ? { kind: "RESTORE" as const, ...bill, due: record.billDueOn } : { kind: "BILL_CHANGED" as const };
}

// The caller locks the ledger row. A later payment or schedule edit makes the
// version stale, so neither the ledger nor the schedule is changed.
export async function restoreBillPayment(tx: Tx, userId: string, record: Receipt) {
  const restoration = await getBillRestoration(tx, userId, record);
  if (restoration.kind !== "RESTORE") return restoration.kind === "ORDINARY";
  const result = await tx.recurringBill.updateMany({
    where: { userId, id: restoration.id, version: restoration.version },
    data: { active: true, completed: false, nextDueOn: restoration.due, paymentsMade: { decrement: 1 }, version: { increment: 1 } },
  });
  return result.count === 1;
}
