import { z } from "zod";
import { billDetailsSchema, billPaymentSchema, billVersionValueSchema, dateSchema, idSchema, moneySchema, transactionSchema, typeSchema } from "@/lib/finance/validation";
import { billDueDate } from "@/lib/finance/bill-schedule";
import { parseDate } from "@/lib/finance/dates";

export const proposalSchema = z.object({ transactions: z.array(transactionSchema).min(1).max(10) }).strict();
export const partialTransactionSchema = z.object({
  type: typeSchema,
  description: z.string().trim().min(1).max(500),
  occurredOn: dateSchema.optional(),
  amount: moneySchema.optional(),
  categoryId: idSchema.optional(),
}).strict();
export const clarificationSchema = z.object({
  transactions: z.array(partialTransactionSchema).min(1).max(10),
  field: z.enum(["amount", "category", "date"]),
  index: z.number().int().min(0).max(9),
}).strict().refine((value) => value.index < value.transactions.length, "INVALID_CLARIFICATION");

export type Proposal = z.infer<typeof proposalSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type PartialTransaction = z.infer<typeof partialTransactionSchema>;

const scheduledBillDetailsSchema = billDetailsSchema.extend({
  paymentLimit: z.number().int().min(1).max(1200).optional(),
  endsOn: dateSchema.optional(),
});
function validBillSchedule(bill: Partial<z.output<typeof scheduledBillDetailsSchema>>) {
  if (bill.paymentLimit && bill.endsOn) return false;
  if (!bill.nextDueOn) return true;
  if (bill.endsOn) return bill.endsOn >= bill.nextDueOn;
  if (!bill.paymentLimit || !bill.cadence) return true;
  if (!dateSchema.safeParse(bill.nextDueOn).success) return false;
  const nextDueOn = parseDate(bill.nextDueOn);
  const schedule = { cadence: bill.cadence, nextDueOn, dayOfMonth: nextDueOn.getUTCDate() };
  return billDueDate(schedule, bill.paymentLimit - 1).getUTCFullYear() <= 2100;
}
export const billDraftSchema = scheduledBillDetailsSchema.partial().refine(validBillSchedule);
export const billClarificationSchema = z.object({ operation: z.literal("create_bill"), bill: billDraftSchema }).strict();
export const billPaymentClarificationSchema = z.object({
  operation: z.literal("pay_bill"),
  payment: billPaymentSchema.omit({ description: true }).partial({ amount: true }),
  choices: z.array(idSchema).min(1).max(10).optional(),
}).strict();
export const billProposalSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create_bill"), bill: scheduledBillDetailsSchema.refine(validBillSchedule) }).strict(),
  z.object({
    operation: z.literal("pay_bill"), billId: idSchema, version: billVersionValueSchema,
    name: billDetailsSchema.shape.name, nextDueOn: dateSchema, payment: billPaymentSchema,
    scheduleAfter: z.object({ nextDueOn: dateSchema.nullable(), progress: z.string().max(140) }).strict().optional(),
  }).strict(),
]);
const transactionChoice = z.object({ mode: z.enum(["edit", "undo"]), amount: moneySchema.optional() }).strict()
  .refine(({ mode, amount }) => mode === "undo" || Boolean(amount));
export const transactionSelectionSchema = z.object({
  operation: z.literal("choose_transaction"), change: transactionChoice, choices: z.array(idSchema).min(1).max(10),
}).strict();
const dateTime = z.iso.datetime({ precision: 3 });
export const notificationSettingsSchema = z.object({
  billReminderDays: z.number().int().min(0).max(30).nullable(),
  budgetReminderPercent: z.number().int().min(1).max(100).nullable(),
  weeklyDigestDay: z.number().int().min(1).max(7).nullable(),
}).strict();
export const financeMutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("change_transaction"), change: transactionChoice,
    record: transactionSchema.extend({ id: idSchema, updatedAt: dateTime, categoryName: z.string().max(80) }),
    restore: z.object({ name: billDetailsSchema.shape.name, dueOn: dateSchema, version: billVersionValueSchema }).strict().optional(),
  }).strict(),
  z.object({
    operation: z.literal("set_budget"), categoryId: idSchema, categoryName: z.string().max(80),
    period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), amount: moneySchema,
    previous: z.object({ id: idSchema, amount: moneySchema, updatedAt: dateTime }).strict().nullable(),
  }).strict(),
  z.object({
    operation: z.literal("set_notifications"), version: billVersionValueSchema,
    previous: notificationSettingsSchema, next: notificationSettingsSchema,
  }).strict(),
]);
export const recordContextSchema = z.object({
  kind: z.enum(["bill", "transaction"]), ids: z.array(idSchema).min(1).max(10),
  relatedBillId: idSchema.optional(),
}).strict();
export const pendingProposalSchema = z.union([proposalSchema, billProposalSchema, financeMutationSchema]);
export const pendingClarificationSchema = z.union([clarificationSchema, billClarificationSchema, billPaymentClarificationSchema, transactionSelectionSchema]);
export type BillDraft = z.infer<typeof billDraftSchema>;
export type BillProposal = z.infer<typeof billProposalSchema>;
export type BillClarification = z.infer<typeof billClarificationSchema>;
export type BillPaymentDraft = z.infer<typeof billPaymentClarificationSchema>["payment"];
export type FinanceMutation = z.infer<typeof financeMutationSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type RecordContext = z.infer<typeof recordContextSchema>;
