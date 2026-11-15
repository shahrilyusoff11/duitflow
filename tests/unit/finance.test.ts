import { describe, expect, it } from "vitest";
import { budgetProgress, Decimal, formatMyr, parseMoney } from "../../src/lib/finance/money";
import { monthRange, parseDate, resolveRelativeDate, todayInMalaysia } from "../../src/lib/finance/dates";
import { budgetSchema, filterSchema, transactionSchema } from "../../src/lib/finance/validation";

describe("money strings and exact arithmetic", () => {
  it.each([
    ["RM12", "12.00"], ["RM 12", "12.00"], ["rm12.50", "12.50"], ["RM1,200", "1200.00"], ["RM1,200.50", "1200.50"],
    ["12 ringgit", "12.00"], ["12 ringgit 50 sen", "12.50"], ["1.2k", "1200.00"], ["2k", "2000.00"], ["50 sen", "0.50"], ["0.01", "0.01"], ["10000000", "10000000.00"],
  ])("normalizes %s", (input, result) => expect(parseMoney(input).toFixed(2)).toBe(result));
  it.each(["0", "RM0.00", "-1", "+12", "1.200", "1.234", "1.000001k", "10000000.01", "1e3", "NaN", "Infinity", "12,50", "1,20", "RM12 extra", "1.2.3", "RM", "", "0 sen", "12 ringgit 100 sen"])("rejects %s", (input) => expect(() => parseMoney(input)).toThrow());
  it("adds cents, subtracts and formats without binary rounding", () => {
    expect(parseMoney("0.10").plus(parseMoney("0.20")).toFixed(2)).toBe("0.30");
    expect(new Decimal("10000000").minus("0.01").toFixed(2)).toBe("9999999.99");
    expect(formatMyr("-1234.50")).toBe("−RM 1,234.50");
  });
  it("warns exactly at configured and 100% thresholds, retaining negative remaining", () => {
    expect(budgetProgress("79.99", "100", 80).status).toBe("OK");
    expect(budgetProgress("80", "100", 80).status).toBe("WARNING");
    expect(budgetProgress("60", "100", 60).status).toBe("WARNING");
    expect(budgetProgress("100", "100", 80).status).toBe("EXCEEDED");
    expect(budgetProgress("101.01", "100", 80)).toMatchObject({ remaining: "-1.01", bar: 100, status: "EXCEEDED" });
  });
});

describe("Malaysian local dates", () => {
  it.each([
    ["2026-10-31T15:59:59Z", "2026-10-31"], ["2026-10-31T16:00:00Z", "2026-11-01"],
    ["2026-12-31T16:00:00Z", "2027-01-01"], ["2024-02-28T16:00:00Z", "2024-02-29"],
  ])("resolves local day at %s", (instant, day) => expect(todayInMalaysia(new Date(instant))).toBe(day));
  it.each([["2026-10", "2026-10-01", "2026-11-01"], ["2026-12", "2026-12-01", "2027-01-01"], ["2024-02", "2024-02-01", "2024-03-01"]])("uses exclusive month end for %s", (month, start, end) => {
    expect(monthRange(month).start.toISOString().slice(0, 10)).toBe(start);
    expect(monthRange(month).end.toISOString().slice(0, 10)).toBe(end);
  });
  it("resolves relative days across year and leap boundaries on the server", () => {
    expect(resolveRelativeDate("semalam", new Date("2026-12-31T16:30:00Z"))).toBe("2026-12-31");
    expect(resolveRelativeDate("semalam", new Date("2024-02-29T16:30:00Z"))).toBe("2024-02-29");
    expect(resolveRelativeDate("kelmarin", new Date("2026-10-31T16:30:00Z"))).toBe("2026-10-30");
    expect(resolveRelativeDate("minggu lepas", new Date("2026-10-31T16:30:00Z"))).toBe("2026-10-25");
  });
  it.each(["2026-02-29", "2024-02-30", "2026-13-01", "2026-1-1", "2026-11-01T00:00:00Z", "1999-12-31"])("rejects invalid date %s", (date) => expect(() => parseDate(date)).toThrow());
});

it("bounds untrusted filters and rejects injected ownership/source", () => {
  expect(filterSchema.safeParse({ pageSize: 51 }).success).toBe(false);
  expect(filterSchema.safeParse({ page: -1 }).success).toBe(false);
  expect(filterSchema.safeParse({ from: "2026-11-02", to: "2026-11-01" }).success).toBe(false);
  expect(transactionSchema.safeParse({ amount: "1", type: "EXPENSE", categoryId: "a", description: "Test", occurredOn: "2026-11-01", userId: "foreign", source: "TELEGRAM" }).success).toBe(false);
  expect(budgetSchema.safeParse({ categoryId: "a", period: "2026-13", limitAmount: "100", warningAt: 80 }).success).toBe(false);
});
