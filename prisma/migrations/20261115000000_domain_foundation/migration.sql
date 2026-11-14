-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('WEB', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "PendingActionKind" AS ENUM ('PROPOSAL', 'CLARIFICATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "aiParsingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "source" "TransactionSource" NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "limitAmount" DECIMAL(12,2) NOT NULL,
    "warningAt" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" VARCHAR(20) NOT NULL,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedToken" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "telegramUpdateId" BIGINT NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("telegramUpdateId")
);

-- CreateTable
CREATE TABLE "PendingTelegramAction" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" VARCHAR(20) NOT NULL,
    "kind" "PendingActionKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingTelegramAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "bucket" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_transactionType_key" ON "Category"("userId", "name", "transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_transactionType_key" ON "Category"("id", "userId", "transactionType");

-- CreateIndex
CREATE INDEX "Transaction_userId_occurredOn_idx" ON "Transaction"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_occurredOn_idx" ON "Transaction"("userId", "categoryId", "occurredOn");

-- CreateIndex
CREATE INDEX "Budget_userId_year_month_idx" ON "Budget"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_year_month_key" ON "Budget"("userId", "categoryId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_telegramUserId_key" ON "TelegramConnection"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_hashedToken_key" ON "TelegramLinkToken"("hashedToken");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_userId_expiresAt_idx" ON "TelegramLinkToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "TelegramUpdate_status_lockedAt_idx" ON "TelegramUpdate"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "TelegramUpdate_updatedAt_idx" ON "TelegramUpdate"("updatedAt");

-- CreateIndex
CREATE INDEX "PendingTelegramAction_userId_consumedAt_expiresAt_idx" ON "PendingTelegramAction"("userId", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PendingTelegramAction_expiresAt_idx" ON "PendingTelegramAction"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitEvent_key_bucket_createdAt_idx" ON "RateLimitEvent"("key", "bucket", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitEvent_createdAt_idx" ON "RateLimitEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "Category"("id", "userId", "transactionType") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_userId_categoryType_fkey" FOREIGN KEY ("categoryId", "userId", "categoryType") REFERENCES "Category"("id", "userId", "transactionType") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingTelegramAction" ADD CONSTRAINT "PendingTelegramAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
