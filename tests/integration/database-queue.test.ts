import { expect, it, vi } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { getDatabase } from "../../src/lib/db";

vi.mock("server-only", () => ({}));

it("refreshes the development client when Prisma is regenerated", async () => {
  const cache = globalThis as unknown as { prisma?: unknown; prismaConstructor?: unknown };
  const { prisma, prismaConstructor } = cache;
  const oldClient = { transaction: {}, $disconnect: async () => {} };
  cache.prisma = oldClient;
  cache.prismaConstructor = function PreviousPrismaClient() {};
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://postgres@127.0.0.1:1/disposable");
  let client: ReturnType<typeof getDatabase> | undefined;
  try {
    client = getDatabase();
    expect(client).not.toBe(oldClient);
    expect(client.recurringBill.findMany).toBeTypeOf("function");
    expect(getDatabase()).toBe(client);
  } finally {
    cache.prisma = prisma;
    cache.prismaConstructor = prismaConstructor;
    vi.unstubAllEnvs();
    await client?.$disconnect();
  }
});

it("lets a transaction acquire the application's busy connection after three seconds", async () => {
  const fixture = await createTestDatabase();
  vi.stubEnv("DATABASE_URL", fixture.connectionString);
  const database = getDatabase();
  const acquired = Promise.withResolvers<void>();
  const busy = database.$transaction(async () => {
    acquired.resolve();
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  });
  try {
    await Promise.race([acquired.promise, busy]);
    const count = await database.$transaction((tx) => tx.transaction.count(), { isolationLevel: "RepeatableRead" });
    expect(count).toBe(0);
  } finally {
    await busy.finally(async () => {
      await database.$disconnect();
      await fixture.close();
      vi.unstubAllEnvs();
    });
  }
});
