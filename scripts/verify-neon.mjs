import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { databaseConnectionString } from "../src/lib/config/database.ts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseConnectionString(process.env), max: 1, connectionTimeoutMillis: 15_000 }) });
const id = `verify-neon-${randomUUID()}`;
const rollback = new Error("INTENTIONAL_VERIFICATION_ROLLBACK");
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Neon pooled connection through Prisma: PASS");
  const migrations = await prisma.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`;
  if (migrations[0].count !== 3) throw new Error("MIGRATION_COUNT_MISMATCH");
  console.log("Reviewed migrations applied: 3");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id, name: "Synthetic Neon verification", email: `${id}@example.test` } });
      const categories = await tx.category.findMany({ where: { userId: id } });
      if (categories.length !== 10) throw new Error("CATEGORY_SEED_MISMATCH");
      const category = categories.find((entry) => entry.transactionType === "EXPENSE");
      const saved = await tx.transaction.create({ data: {
        userId: id, categoryId: category.id, type: "EXPENSE", amount: "12.50",
        description: "Synthetic verification; rolled back", occurredOn: new Date("2026-11-15T00:00:00.000Z"),
      } });
      if (saved.amount.toFixed(2) !== "12.50" || saved.occurredOn.toISOString().slice(0, 10) !== "2026-11-15") throw new Error("ROUND_TRIP_MISMATCH");
      throw rollback;
    }, { maxWait: 15_000, timeout: 20_000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await prisma.user.count({ where: { id } });
  const remainingCategories = await prisma.category.count({ where: { userId: id } });
  const remainingTransactions = await prisma.transaction.count({ where: { userId: id } });
  if (remaining || remainingCategories || remainingTransactions) throw new Error("VERIFICATION_ROLLBACK_FAILED");
  console.log("Atomic per-user category seeding (10 categories): PASS");
  console.log("DECIMAL 12.50 and Malaysian DATE round-trip: PASS");
  console.log("Verification rolled back; no test records remain: PASS");
} catch (error) {
  console.error(`Neon verification: FAIL (${error.code ?? "DATABASE_CHECK_FAILED"})`);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
