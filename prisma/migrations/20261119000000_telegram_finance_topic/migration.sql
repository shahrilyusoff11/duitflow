ALTER TABLE "TelegramConnection"
    ADD COLUMN "financeTopic" JSONB,
    ADD COLUMN "financeTopicExpiresAt" TIMESTAMPTZ(3);

CREATE INDEX "TelegramConnection_financeTopicExpiresAt_idx"
    ON "TelegramConnection" ("financeTopicExpiresAt");
