-- Auth is approved. Apply this migration to the empty development domain DB.
-- Existing identities need deliberate mapping; do not invent names/emails.
ALTER TABLE "User"
  ADD COLUMN "name" TEXT NOT NULL,
  ADD COLUMN "email" TEXT NOT NULL,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "image" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ(3),
  "refreshTokenExpiresAt" TIMESTAMPTZ(3),
  "scope" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- OAuth CSRF/PKCE state is single-use verification data. No email auth exists.
CREATE TABLE "Verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

-- PostgreSQL triggers run inside the user-creation transaction, unlike an
-- after-commit application hook. Failed signup cannot leave partial categories.
CREATE FUNCTION seed_user_categories() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "Category" ("id", "userId", "name", "transactionType") VALUES
    (NEW."id" || ':default:food', NEW."id", 'Makanan & Minuman', 'EXPENSE'),
    (NEW."id" || ':default:transport', NEW."id", 'Pengangkutan', 'EXPENSE'),
    (NEW."id" || ':default:bills', NEW."id", 'Bil & Utiliti', 'EXPENSE'),
    (NEW."id" || ':default:home', NEW."id", 'Keperluan Rumah', 'EXPENSE'),
    (NEW."id" || ':default:health', NEW."id", 'Kesihatan', 'EXPENSE'),
    (NEW."id" || ':default:leisure', NEW."id", 'Hiburan', 'EXPENSE'),
    (NEW."id" || ':default:expense-other', NEW."id", 'Lain-lain', 'EXPENSE'),
    (NEW."id" || ':default:salary', NEW."id", 'Gaji', 'INCOME'),
    (NEW."id" || ':default:side-income', NEW."id", 'Pendapatan Sampingan', 'INCOME'),
    (NEW."id" || ':default:income-other', NEW."id", 'Lain-lain', 'INCOME');
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_seed_categories" AFTER INSERT ON "User"
  FOR EACH ROW EXECUTE FUNCTION seed_user_categories();
