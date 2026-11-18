ALTER TABLE "TelegramLinkToken" ADD COLUMN "pendingTelegramUserId" VARCHAR(20);

UPDATE "PendingTelegramAction"
SET "payload" = 'null'::jsonb
WHERE "consumedAt" IS NOT NULL OR "expiresAt" <= CURRENT_TIMESTAMP;
