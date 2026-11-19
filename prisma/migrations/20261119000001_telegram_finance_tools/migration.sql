ALTER TABLE "Transaction"
  ADD COLUMN "billId" TEXT,
  ADD COLUMN "billDueOn" DATE,
  ADD COLUMN "billPaidVersion" INTEGER,
  ADD COLUMN "paymentTrackingKnown" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "Transaction_bill_receipt_check" CHECK (
    ("billId" IS NULL AND "billDueOn" IS NULL AND "billPaidVersion" IS NULL)
    OR ("billId" IS NOT NULL AND "billDueOn" IS NOT NULL AND "billPaidVersion" IS NOT NULL
      AND "billPaidVersion" > 0 AND "paymentTrackingKnown" AND "type" = 'EXPENSE')
  );
ALTER TABLE "Transaction" ALTER COLUMN "paymentTrackingKnown" SET DEFAULT true;

ALTER TABLE "RecurringBill"
  ADD COLUMN "paymentLimit" INTEGER,
  ADD COLUMN "endsOn" DATE,
  ADD COLUMN "paymentsMade" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "RecurringBill_finite_schedule_check" CHECK (
    ("paymentLimit" IS NULL OR ("paymentLimit" BETWEEN 1 AND 1200 AND "paymentsMade" <= "paymentLimit"))
    AND ("endsOn" IS NULL OR ("endsOn" >= "nextDueOn" AND "endsOn" <= DATE '2100-12-31'))
    AND ("paymentLimit" IS NULL OR "endsOn" IS NULL)
    AND ("paymentsMade" >= 0) AND (NOT "completed" OR NOT "active")
    AND ("paymentLimit" IS NULL OR "paymentsMade" < "paymentLimit" OR "completed")
  );

ALTER TABLE "TelegramConnection"
  ADD COLUMN "recordContext" JSONB,
  ADD COLUMN "recordContextExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "recordContextUpdateId" BIGINT,
  ADD COLUMN "billReminderDays" INTEGER,
  ADD COLUMN "budgetReminderPercent" INTEGER,
  ADD COLUMN "weeklyDigestDay" INTEGER,
  ADD COLUMN "notificationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "TelegramConnection_notifications_check" CHECK (
    ("billReminderDays" BETWEEN 0 AND 30 OR "billReminderDays" IS NULL)
    AND ("budgetReminderPercent" BETWEEN 1 AND 100 OR "budgetReminderPercent" IS NULL)
    AND ("weeklyDigestDay" BETWEEN 1 AND 7 OR "weeklyDigestDay" IS NULL)
  );
CREATE INDEX "TelegramConnection_recordContextExpiresAt_idx" ON "TelegramConnection"("recordContextExpiresAt");

CREATE TABLE "TelegramDelivery" (
  "connectionId" TEXT NOT NULL,
  "eventKey" VARCHAR(160) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "retryAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TelegramDelivery_pkey" PRIMARY KEY ("connectionId", "eventKey"),
  CONSTRAINT "TelegramDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TelegramConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramDelivery_expiresAt_idx" ON "TelegramDelivery"("expiresAt");
