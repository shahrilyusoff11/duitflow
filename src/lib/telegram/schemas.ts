import { z } from "zod";
import { billDetailsSchema, billPaymentSchema, billVersionValueSchema, dateSchema, idSchema, moneySchema, transactionSchema, typeSchema } from "@/lib/finance/validation";

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

export const billDraftSchema = billDetailsSchema.partial();
export const billClarificationSchema = z.object({ operation: z.literal("create_bill"), bill: billDraftSchema }).strict();
export const billPaymentClarificationSchema = z.object({
  operation: z.literal("pay_bill"),
  payment: billPaymentSchema.omit({ description: true }).partial({ amount: true }),
}).strict();
export const billProposalSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create_bill"), bill: billDetailsSchema }).strict(),
  z.object({
    operation: z.literal("pay_bill"), billId: idSchema, version: billVersionValueSchema,
    name: billDetailsSchema.shape.name, nextDueOn: dateSchema, payment: billPaymentSchema,
  }).strict(),
]);
export const pendingProposalSchema = z.union([proposalSchema, billProposalSchema]);
export const pendingClarificationSchema = z.union([clarificationSchema, billClarificationSchema, billPaymentClarificationSchema]);
export type BillDraft = z.infer<typeof billDraftSchema>;
export type BillProposal = z.infer<typeof billProposalSchema>;
export type BillClarification = z.infer<typeof billClarificationSchema>;
export type BillPaymentDraft = z.infer<typeof billPaymentClarificationSchema>["payment"];
