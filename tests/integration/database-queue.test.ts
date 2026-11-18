import { expect, it, vi } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { getDatabase } from "../../src/lib/db";

vi.mock("server-only", () => ({}));

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
