export function todayInMalaysia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DATE");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < "2000-01-01" || value > "2100-12-31") throw new Error("INVALID_DATE");
  return date;
}

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("INVALID_MONTH");
  const start = parseDate(`${month}-01`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export function shiftMonth(month: string, offset: number): string {
  const date = monthRange(month).start;
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function resolveRelativeDate(expression: "today" | "semalam" | "kelmarin" | "minggu lepas", now = new Date()): string {
  const date = parseDate(todayInMalaysia(now));
  const days = { today: 0, semalam: 1, kelmarin: 2, "minggu lepas": 7 }[expression];
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat("ms-MY", { dateStyle: "medium", timeZone: "UTC" }).format(parseDate(date));
}
