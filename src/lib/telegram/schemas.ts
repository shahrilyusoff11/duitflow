import { z } from "zod";
import { dateSchema, idSchema, moneySchema, transactionSchema, typeSchema } from "@/lib/finance/validation";

export const proposalSchema = z.object({ transactions: z.array(transactionSchema).min(1).max(10) }).strict();
export const partialTransactionSchema = z.object({
  type: typeSchema,
  description: z.string().trim().min(1).max(500),
  occurredOn: dateSchema,
  amount: moneySchema.optional(),
  categoryId: idSchema.optional(),
}).strict();
export const clarificationSchema = z.object({
  transactions: z.array(partialTransactionSchema).min(1).max(10),
  field: z.enum(["amount", "category"]),
  index: z.number().int().min(0).max(9),
}).strict().refine((value) => value.index < value.transactions.length, "INVALID_CLARIFICATION");

export type Proposal = z.infer<typeof proposalSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type PartialTransaction = z.infer<typeof partialTransactionSchema>;
