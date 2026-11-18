import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let database: PGlite;

beforeAll(async () => {
  database = await PGlite.create();
  const root = join(process.cwd(), "prisma", "migrations");
  const directories = await readdir(root, { withFileTypes: true });
  for (const directory of directories.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await database.exec(await readFile(join(root, directory.name, "migration.sql"), "utf8"));
  }
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
