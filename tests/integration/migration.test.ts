import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let database: PGlite;
const migrationRoot = join(process.cwd(), "prisma", "migrations");
const telegramPrivacyMigration = "20261118000002_telegram_privacy";
const telegramFinanceTopicMigration = "20261119000000_telegram_finance_topic";
const telegramFinanceToolsMigration = "20261119000001_telegram_finance_tools";

async function applyMigrations(target: PGlite, before?: string) {
  const directories = await readdir(migrationRoot, { withFileTypes: true });
  for (const directory of directories.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (directory.name === before) break;
    await target.exec(await readFile(join(migrationRoot, directory.name, "migration.sql"), "utf8"));
  }
}

beforeAll(async () => {
  database = await PGlite.create();
  await applyMigrations(database);
});

beforeEach(async () => {
  await database.exec(`
    TRUNCATE TABLE "User" CASCADE;
    INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES
      ('alice', 'Alice Test', 'alice@example.test', now()),
      ('bob', 'Bob Test', 'bob@example.test', now());
    INSERT INTO "Category" ("id", "userId", "name", "transactionType") VALUES
      ('alice-food', 'alice', 'Makanan', 'EXPENSE'),
      ('bob-food', 'bob', 'Makanan', 'EXPENSE'),
      ('alice-salary', 'alice', 'Gaji Ujian', 'INCOME');
  `);
});

afterAll(async () => { await database?.close(); });

function insertTransaction(amount: string, categoryId = "alice-food", type = "EXPENSE", date = "2026-11-01") {
  return database.query(`
    INSERT INTO "Transaction" ("id", "userId", "categoryId", "type", "amount", "description", "occurredOn", "updatedAt")
    VALUES ('test-transaction', 'alice', $1, $2::"TransactionType", $3::numeric, 'Synthetic test record', $4::date, now())
  `, [categoryId, type, amount, date]);
}

function insertBudget(categoryId: string, type: string, month = 11) {
  return database.query(`
    INSERT INTO "Budget" ("id", "userId", "categoryId", "categoryType", "year", "month", "limitAmount", "updatedAt")
    VALUES ('test-budget', 'alice', $1, $2::"TransactionType", 2026, $3, 500, now())
  `, [categoryId, type, month]);
}

describe("reviewed PostgreSQL migrations", () => {
  it("preserves legacy accounts, schedules and expenses while defaulting notifications off and tracking new payments", async () => {
    const upgrade = await PGlite.create();
    try {
      await applyMigrations(upgrade, telegramFinanceToolsMigration);
      await upgrade.exec(`
        INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES
          ('legacy', 'Legacy Test', 'legacy@example.test', now());
        INSERT INTO "TelegramConnection" ("id", "userId", "telegramUserId") VALUES ('legacy-link', 'legacy', '123456');
        INSERT INTO "RecurringBill" ("id", "userId", "categoryId", "name", "amount", "cadence", "nextDueOn", "dayOfMonth", "updatedAt")
          VALUES ('legacy-bill', 'legacy', 'legacy:default:bills', 'Synthetic bill', 50, 'MONTHLY', '2026-12-01', 1, now());
        INSERT INTO "Transaction" ("id", "userId", "categoryId", "type", "amount", "description", "occurredOn", "updatedAt")
          VALUES ('legacy-expense', 'legacy', 'legacy:default:bills', 'EXPENSE', 50, 'Synthetic expense', '2026-11-01', now());
      `);
      await upgrade.exec(await readFile(join(migrationRoot, telegramFinanceToolsMigration, "migration.sql"), "utf8"));
      expect((await upgrade.query('SELECT "billReminderDays", "budgetReminderPercent", "weeklyDigestDay", "recordContext" FROM "TelegramConnection"')).rows)
        .toEqual([{ billReminderDays: null, budgetReminderPercent: null, weeklyDigestDay: null, recordContext: null }]);
      expect((await upgrade.query('SELECT "active", "completed", "paymentsMade", "paymentLimit" FROM "RecurringBill"')).rows)
        .toEqual([{ active: true, completed: false, paymentsMade: 0, paymentLimit: null }]);
      await upgrade.exec(`
        INSERT INTO "Transaction" ("id", "userId", "categoryId", "type", "amount", "description", "occurredOn", "updatedAt")
          VALUES ('new-expense', 'legacy', 'legacy:default:bills', 'EXPENSE', 50, 'Synthetic expense', '2026-11-02', now());
      `);
      expect((await upgrade.query('SELECT "paymentTrackingKnown" FROM "Transaction" ORDER BY "id"')).rows)
        .toEqual([{ paymentTrackingKnown: false }, { paymentTrackingKnown: true }]);
      await expect(upgrade.query('UPDATE "RecurringBill" SET "paymentLimit" = 0')).rejects.toMatchObject({ code: "23514" });
      await expect(upgrade.query('UPDATE "TelegramConnection" SET "weeklyDigestDay" = 8')).rejects.toMatchObject({ code: "23514" });
      await expect(upgrade.query(`UPDATE "Transaction" SET "billId" = 'legacy-bill' WHERE "id" = 'new-expense'`)).rejects.toMatchObject({ code: "23514" });
    } finally { await upgrade.close(); }
  });

  it("preserves existing Telegram links when adding optional financial conversation context", async () => {
    const upgrade = await PGlite.create();
    try {
      await applyMigrations(upgrade, telegramFinanceTopicMigration);
      await upgrade.exec(`
        INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES
          ('existing', 'Existing Test', 'existing@example.test', now());
        INSERT INTO "TelegramConnection" ("id", "userId", "telegramUserId") VALUES
          ('existing-link', 'existing', '123456');
      `);
      await upgrade.exec(await readFile(join(migrationRoot, telegramFinanceTopicMigration, "migration.sql"), "utf8"));
      const result = await upgrade.query('SELECT "userId", "telegramUserId", "financeTopic", "financeTopicExpiresAt" FROM "TelegramConnection" WHERE "id" = $1', ["existing-link"]);
      expect(result.rows).toEqual([{ userId: "existing", telegramUserId: "123456", financeTopic: null, financeTopicExpiresAt: null }]);
    } finally { await upgrade.close(); }
  });
  it("clears legacy terminal payloads while preserving active proposals and replay rows", async () => {
    const upgrade = await PGlite.create();
    try {
      await applyMigrations(upgrade, telegramPrivacyMigration);
      await upgrade.exec(`
        INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES
          ('active', 'Active Test', 'active@example.test', now()),
          ('expired', 'Expired Test', 'expired@example.test', now());
        INSERT INTO "PendingTelegramAction" ("id", "userId", "telegramUserId", "kind", "payload", "expiresAt", "consumedAt") VALUES
          ('00000000-0000-4000-8000-000000000001', 'active', '123456', 'PROPOSAL', '{"amount":"12"}', now() + interval '10 minutes', NULL),
          ('00000000-0000-4000-8000-000000000002', 'active', '123456', 'PROPOSAL', '{"amount":"20"}', now() + interval '10 minutes', now()),
          ('00000000-0000-4000-8000-000000000003', 'expired', '234567', 'CLARIFICATION', '{"description":"Synthetic"}', now() - interval '1 minute', NULL);
      `);
      await upgrade.exec(await readFile(join(migrationRoot, telegramPrivacyMigration, "migration.sql"), "utf8"));
      const result = await upgrade.query('SELECT "payload" FROM "PendingTelegramAction" ORDER BY "id"');
      expect(result.rows).toEqual([{ payload: { amount: "12" } }, { payload: null }, { payload: null }]);
    } finally { await upgrade.close(); }
  });
  it("defaults AI consent off", async () => {
    const result = await database.query<{ deepseekParsingEnabled: boolean }>('SELECT "deepseekParsingEnabled" FROM "User" WHERE "id" = $1', ["alice"]);
    expect(result.rows[0].deepseekParsingEnabled).toBe(false);
  });

  it("permits equal category names for different users but rejects duplicate defaults for one user", async () => {
    await expect(database.query(`INSERT INTO "Category" ("id", "userId", "name", "transactionType") VALUES ('duplicate', 'alice', 'Makanan', 'EXPENSE')`)).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects another user's category even if the transaction userId is valid", async () => {
    await expect(insertTransaction("12.00", "bob-food")).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a category whose type does not match the transaction", async () => {
    await expect(insertTransaction("12.00", "alice-salary")).rejects.toMatchObject({ code: "23503" });
  });

  it.each(["0", "-1", "10000000.01"])("rejects an amount outside the allowed range (%s)", async (amount) => {
    await expect(insertTransaction(amount)).rejects.toMatchObject({ code: "23514" });
  });

  it("preserves exact decimal arithmetic and DATE values regardless of DB timezone", async () => {
    await insertTransaction("0.10");
    await database.exec("SET TIME ZONE 'America/Los_Angeles'");
    const result = await database.query<{ total: string; date: string }>(`
      SELECT ("amount" + 0.20)::text AS total, "occurredOn"::text AS date FROM "Transaction"
    `);
    expect(result.rows).toEqual([{ total: "0.30", date: "2026-11-01" }]);
  });

  it("blocks deleting a category that is in use", async () => {
    await insertTransaction("12.00");
    await expect(database.query('DELETE FROM "Category" WHERE "id" = $1', ["alice-food"])).rejects.toMatchObject({ code: "23001" });
  });

  it("rejects cross-user budgets", async () => {
    await expect(insertBudget("bob-food", "EXPENSE")).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects income-category budgets", async () => {
    await expect(insertBudget("alice-salary", "INCOME")).rejects.toMatchObject({ code: "23514" });
  });

  it.each([0, 13])("rejects invalid budget month %s", async (month) => {
    await expect(insertBudget("alice-food", "EXPENSE", month)).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces one unconsumed pending action and allows an atomic replacement", async () => {
    const insert = (id: string) => database.query(`
      INSERT INTO "PendingTelegramAction" ("id", "userId", "telegramUserId", "kind", "payload", "expiresAt")
      VALUES ($1::uuid, 'alice', '123456', 'PROPOSAL', '{}', now() + interval '10 minutes')
    `, [id]);
    await insert("00000000-0000-4000-8000-000000000001");
    await expect(insert("00000000-0000-4000-8000-000000000002")).rejects.toMatchObject({ code: "23505" });
    await database.transaction(async (tx) => {
      await tx.query('UPDATE "PendingTelegramAction" SET "consumedAt" = now() WHERE "userId" = $1', ["alice"]);
      await tx.query(`
        INSERT INTO "PendingTelegramAction" ("id", "userId", "telegramUserId", "kind", "payload", "expiresAt")
        VALUES ('00000000-0000-4000-8000-000000000002', 'alice', '123456', 'CLARIFICATION', '{}', now() + interval '10 minutes')
      `);
    });
    const result = await database.query<{ count: number }>('SELECT count(*)::int AS count FROM "PendingTelegramAction" WHERE "userId" = $1 AND "consumedAt" IS NULL', ["alice"]);
    expect(result.rows[0].count).toBe(1);
  });

  it("prevents one Telegram identity from linking to two users", async () => {
    await database.query(`INSERT INTO "TelegramConnection" ("id", "userId", "telegramUserId") VALUES ('first', 'alice', '123456')`);
    await expect(database.query(`INSERT INTO "TelegramConnection" ("id", "userId", "telegramUserId") VALUES ('second', 'bob', '123456')`)).rejects.toMatchObject({ code: "23505" });
  });
});
