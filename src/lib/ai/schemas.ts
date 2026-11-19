import { z } from "zod";
import { moneySchema, monthSchema } from "@/lib/finance/validation";
import { genericCategoryNames, referencePattern } from "./input";

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
export const aiTransactionsSchema = z.object({
  intent: z.literal("add_transactions"),
  transactions: z.array(z.object({
    sourceIndex: z.number().int().min(1).max(10),
    type: z.enum(["INCOME", "EXPENSE"]),
    categoryName: z.enum(genericCategoryNames).nullable(),
  }).strict()).min(1).max(10),
  requiresConfirmation: z.literal(true),
}).strict();
export type AiTransactions = z.infer<typeof aiTransactionsSchema>;

export const MAX_AI_OUTPUT_BYTES = 20_000;

const reference = z.string().regex(new RegExp("^" + referencePattern.source + "$"));
const aiCategory = z.union([z.enum(genericCategoryNames), reference]);
const billTarget = z.union([reference, z.literal("context")]);
const aiPeriod = reference.optional();
const aiQuerySchema = z.discriminatedUnion("operation", [
  analysisQuery.extend({ period: aiPeriod }),
  trendQuery.extend({ period: aiPeriod, months: reference.optional() }),
  z.object({ operation: z.literal("net_for_period"), period: aiPeriod }).strict(),
  z.object({ operation: z.literal("total_for_period"), period: aiPeriod, type: z.enum(["INCOME", "EXPENSE"]) }).strict(),
  z.object({ operation: z.literal("report_for_period"), period: aiPeriod, view: z.enum(["EXPENSE", "FULL"]) }).strict(),
  z.object({ operation: z.literal("spend_by_category"), period: aiPeriod, categoryName: aiCategory }).strict(),
  z.object({ operation: z.literal("top_categories"), period: aiPeriod, limit: reference.optional() }).strict(),
  z.object({ operation: z.literal("budget_status"), period: aiPeriod, categoryName: aiCategory.optional() }).strict(),
  purchaseQuery.extend({ period: aiPeriod, categoryName: aiCategory.optional(), amount: reference.optional() }),
  z.object({ operation: z.literal("recent_transactions"), limit: reference.optional() }).strict(),
]);
export const aiChatSchema = z.discriminatedUnion("intent", [
  aiTransactionsSchema,
  z.object({ intent: z.literal("finance_query"), query: aiQuerySchema }).strict(),
  z.object({ intent: z.literal("spending_change") }).strict(),
  z.object({ intent: z.literal("follow_up"), kind: z.enum(["PERIOD", "AMOUNT", "SAVINGS"]), value: reference.optional() }).strict(),
  z.object({ intent: z.literal("list_bills"), view: z.enum(["DUE", "NEXT", "NEXT_INSTALLMENT"]) }).strict(),
  z.object({ intent: z.literal("lookup_bill"), target: billTarget }).strict(),
  z.object({ intent: z.literal("pay_bill"), target: billTarget.optional(), requiresConfirmation: z.literal(true) }).strict(),
  z.object({ intent: z.literal("clarify") }).strict(),
  z.object({ intent: z.literal("unsupported") }).strict(),
]);
