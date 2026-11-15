import { Decimal } from "@prisma/client/runtime/client";

export { Decimal };

// Parse the complete input, never a matching substring. No Number conversion.
export function parseMoney(input: string): Decimal {
  if (input.length > 80) throw new Error("INVALID_MONEY");
  const text = input.trim().toLowerCase();
  const number = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?";
  let amount: Decimal;
  const ringgitSen = /^(\d+)\s+ringgit(?:\s+(\d{1,2})\s+sen)?$/.exec(text);
  const sen = /^(\d+)\s+sen$/.exec(text);
  const thousands = /^(\d+(?:\.\d{1,5})?)k$/.exec(text);
  if (ringgitSen) amount = new Decimal(ringgitSen[1]).plus(new Decimal(ringgitSen[2] ?? "0").div(100));
  else if (sen) amount = new Decimal(sen[1]).div(100);
  else if (thousands) amount = new Decimal(thousands[1]).mul(1000);
  else {
    if (!new RegExp(`^(?:rm\\s*)?${number}$`).test(text)) throw new Error("INVALID_MONEY");
    amount = new Decimal(text.replace(/^rm\s*/, "").replaceAll(",", ""));
  }
  if (!amount.isPositive() || amount.isZero() || amount.gt("10000000") || amount.decimalPlaces() > 2) throw new Error("INVALID_MONEY");
  return amount;
}

export function formatMyr(value: string): string {
  const amount = new Decimal(value);
  const [whole, sen] = amount.abs().toFixed(2).split(".");
  return `${amount.isNegative() ? "−" : ""}RM ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${sen}`;
}

export function budgetProgress(spent: string, limit: string, warningAt: number) {
  const used = new Decimal(spent);
  const cap = new Decimal(limit);
  const percent = used.div(cap).mul(100);
  return {
    remaining: cap.minus(used).toFixed(2), percent: percent.toFixed(1),
    // Only a bounded display percentage becomes a number; money stays Decimal.
    bar: percent.clamp(0, 100).toNumber(),
    status: percent.gte(100) ? "EXCEEDED" : percent.gte(warningAt) ? "WARNING" : "OK",
  };
}
