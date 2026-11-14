-- Reviewed SQL: Prisma schema cannot express CHECK or partial unique indexes.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_range"
  CHECK ("amount" > 0 AND "amount" <= 10000000);

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_limit_range"
  CHECK ("limitAmount" > 0 AND "limitAmount" <= 10000000);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_valid_period"
  CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 1970 AND 9999);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_warning_threshold"
  CHECK ("warningAt" BETWEEN 1 AND 100);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_expense_only"
  CHECK ("categoryType" = 'EXPENSE');

ALTER TABLE "TelegramUpdate" ADD CONSTRAINT "TelegramUpdate_nonnegative_attempts"
  CHECK ("attempts" >= 0);

-- Consume expired or superseded actions before creating the next action.
-- Do both operations in the same transaction; the unique index handles races.
CREATE UNIQUE INDEX "PendingTelegramAction_one_unconsumed_per_user"
  ON "PendingTelegramAction" ("userId") WHERE "consumedAt" IS NULL;
