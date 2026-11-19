import { z } from "zod";
import { moneySchema, monthSchema } from "@/lib/finance/validation";

const period = z.union([z.enum(["this_month", "last_month"]), monthSchema]);
const categoryName = z.string().trim().min(1).max(80);
const analysisQuery = z.object({ operation: z.literal("analyze_for_period"), period, focus: z.enum(["OVERVIEW", "SAVINGS"]) }).strict();
const trendQuery = z.object({ operation: z.literal("spending_trend"), period, months: z.number().int().min(2).max(6) }).strict();
const purchaseQuery = z.object({ operation: z.literal("purchase_check"), period, categoryName: categoryName.optional(), amount: moneySchema.optional() }).strict();
const monthlyQueries = [
  analysisQuery,
  trendQuery,
  z.object({ operation: z.literal("net_for_period"), period }).strict(),
  z.object({ operation: z.literal("total_for_period"), period, type: z.enum(["INCOME", "EXPENSE"]) }).strict(),
  z.object({ operation: z.literal("report_for_period"), period, view: z.enum(["EXPENSE", "FULL"]) }).strict(),
  z.object({ operation: z.literal("spend_by_category"), period, categoryName }).strict(),
  z.object({ operation: z.literal("top_categories"), period, limit: z.number().int().min(1).max(10) }).strict(),
  z.object({ operation: z.literal("budget_status"), period, categoryName: categoryName.optional() }).strict(),
] as const;
export const financeQuerySchema = z.discriminatedUnion("operation", [
  ...monthlyQueries,
  purchaseQuery,
  z.object({ operation: z.literal("recent_transactions"), limit: z.number().int().min(1).max(10) }).strict(),
]);
export type FinanceQuery = z.infer<typeof financeQuerySchema>;
export const financeTopicQuerySchema = z.discriminatedUnion("operation", [
  ...monthlyQueries,
  purchaseQuery.omit({ amount: true }).required({ categoryName: true }),
]);
export type FinanceTopicQuery = z.infer<typeof financeTopicQuerySchema>;
export const financeTopicSchema = z.object({
  updateId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  query: financeTopicQuerySchema.nullable(),
}).strict();

// The model classifies numbered items. User-authored values stay on the server.
export const aiOutputSchema = z.object({
  intent: z.enum(["add_transactions", "unsupported"]),
  transactions: z.array(z.object({
    sourceIndex: z.number().int().min(1).max(10),
    type: z.enum(["INCOME", "EXPENSE"]),
    categoryName: categoryName.nullable(),
  }).strict()).max(10),
  requiresConfirmation: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const valid = value.intent === "add_transactions"
    ? value.requiresConfirmation && value.transactions.length > 0
    : value.transactions.length === 0 && !value.requiresConfirmation;
  if (!valid) ctx.addIssue({ code: "custom", message: "INVALID_AI_INTENT" });
});

export const MAX_AI_OUTPUT_BYTES = 20_000;
export function parseAiOutput(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > MAX_AI_OUTPUT_BYTES) throw new Error("INVALID_AI_OUTPUT");
  return aiOutputSchema.parse(JSON.parse(raw));
}
