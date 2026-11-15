import { z } from "zod";
import { monthSchema } from "@/lib/finance/validation";

const period = z.union([z.enum(["this_month", "last_month"]), monthSchema]);
const categoryName = z.string().trim().min(1).max(80);
export const financeQuerySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("net_for_period"), period }).strict(),
  z.object({ operation: z.literal("spend_by_category"), period, categoryName }).strict(),
  z.object({ operation: z.literal("top_categories"), period, limit: z.number().int().min(1).max(10) }).strict(),
  z.object({ operation: z.literal("budget_status"), period, categoryName: categoryName.optional() }).strict(),
  z.object({ operation: z.literal("recent_transactions"), limit: z.number().int().min(1).max(10) }).strict(),
]);
export type FinanceQuery = z.infer<typeof financeQuerySchema>;

// All identity, money arithmetic, date resolution and authorization stay local.
// Null represents a missing/ambiguous extraction; it is never filled by guessing.
export const aiOutputSchema = z.object({
  intent: z.enum(["add_transactions", "query", "unsupported"]),
  transactions: z.array(z.object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: z.string().min(1).max(80).nullable(),
    description: z.string().trim().min(1).max(500),
    categoryName: categoryName.nullable(),
    dateExpression: z.string().min(1).max(40).nullable(),
  }).strict()).max(10),
  uncertainty: z.array(z.enum(["amount", "date", "category", "intent"])).max(4),
  requiresConfirmation: z.boolean(),
  query: financeQuerySchema.nullable(),
}).strict().superRefine((value, ctx) => {
  const valid = value.intent === "add_transactions"
    ? value.requiresConfirmation && value.transactions.length > 0 && value.query === null
    : value.transactions.length === 0 && !value.requiresConfirmation && (value.intent === "query" ? value.query !== null : value.query === null);
  if (!valid) ctx.addIssue({ code: "custom", message: "INVALID_AI_INTENT" });
});

export const MAX_AI_OUTPUT_BYTES = 20_000;
export function parseAiOutput(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > MAX_AI_OUTPUT_BYTES) throw new Error("INVALID_AI_OUTPUT");
  return aiOutputSchema.parse(JSON.parse(raw));
}
