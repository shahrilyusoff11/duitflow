import { monthSchema } from "./validation";
import { todayInMalaysia } from "./dates";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function selectedMonth(input: string | string[] | undefined) {
  const parsed = monthSchema.safeParse(input ?? todayInMalaysia().slice(0, 7));
  return parsed.success ? parsed.data : null;
}

export const invalidFiltersMessage = "Pilihan tarikh atau penapis tidak sah. Sila semak pilihan anda.";
