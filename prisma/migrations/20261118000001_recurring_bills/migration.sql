CREATE TYPE "BillCadence" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "RecurringBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "name" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cadence" "BillCadence" NOT NULL,
    "nextDueOn" DATE NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringBill_expense_only" CHECK ("categoryType" = 'EXPENSE'),
    CONSTRAINT "RecurringBill_amount_range" CHECK ("amount" > 0 AND "amount" <= 10000000),
    CONSTRAINT "RecurringBill_day_of_month" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
    CONSTRAINT "RecurringBill_date_range" CHECK ("nextDueOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    CONSTRAINT "RecurringBill_version_nonnegative" CHECK ("version" >= 0),
    CONSTRAINT "RecurringBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringBill_categoryId_userId_categoryType_fkey" FOREIGN KEY ("categoryId", "userId", "categoryType") REFERENCES "Category"("id", "userId", "transactionType") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "RecurringBill_userId_active_nextDueOn_idx" ON "RecurringBill"("userId", "active", "nextDueOn");
