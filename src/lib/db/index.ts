import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseConnectionString } from "@/lib/config/database";

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };

// Lazily initialized so static builds do not require credentials or contact DBs.
// Keep this module private to server-side auth and the future scoped DAL.
export function getDatabase(): PrismaClient {
  if (!globalDatabase.prisma) {
    const adapter = new PrismaPg({
      connectionString: databaseConnectionString(process.env),
      // Small personal MVP: bound connections per serverless instance. The
      // driver queues concurrent queries; never multiplex wire-protocol clients.
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    globalDatabase.prisma = new PrismaClient({ adapter });
  }
  return globalDatabase.prisma;
}
