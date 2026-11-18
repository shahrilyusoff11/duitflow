import { z } from "zod";
import { parseMoney } from "./money";
import { monthRange, parseDate } from "./dates";

export const idSchema = z.string().min(1).max(100);
export const typeSchema = z.enum(["INCOME", "EXPENSE"]);
export const moneySchema = z.string().max(80).transform((value, ctx) => {
  try { return parseMoney(value).toFixed(2); }
  catch { ctx.addIssue({ code: "custom", message: "Amaun tidak sah. Gunakan contohnya RM12.50; maksimum RM10,000,000." }); return z.NEVER; }
});
export const dateSchema = z.string().refine((value) => { try { parseDate(value); return true; } catch { return false; } }, "Tarikh tidak sah (2000–2100).");
export const monthSchema = z.string().refine((value) => { try { monthRange(value); return true; } catch { return false; } }, "Bulan tidak sah (2000–2100).");
export const categorySchema = z.object({ name: z.string().trim().min(1).max(80), transactionType: typeSchema }).strict();
export const transactionSchema = z.object({ amount: moneySchema, type: typeSchema, categoryId: idSchema, description: z.string().trim().min(1).max(500), occurredOn: dateSchema }).strict();
export const budgetSchema = z.object({ categoryId: idSchema, period: monthSchema, limitAmount: moneySchema, warningAt: z.coerce.number().int().min(1).max(99) }).strict();
export const billSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount: moneySchema,
  categoryId: idSchema,
  cadence: z.enum(["MONTHLY", "YEARLY"]),
  nextDueOn: dateSchema,
  active: z.enum(["yes", "no"]).transform((value) => value === "yes"),
}).strict();
export const billVersionSchema = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.number().int().min(0).max(2_147_483_647));
export const billPaymentSchema = transactionSchema.omit({ type: true, categoryId: true });
export const filterSchema = z.object({
  from: dateSchema.optional(), to: dateSchema.optional(), categoryId: idSchema.optional(), type: typeSchema.optional(),
  search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, "Julat tarikh tidak sah.");
