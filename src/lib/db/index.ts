import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseConnectionString } from "@/lib/config/database";

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient; prismaConstructor?: typeof PrismaClient };
const connectionWaitMs = 10_000;

// Lazily initialized so static builds do not require credentials or contact DBs.
// Keep this module private to server-side auth and the future scoped DAL.
export function getDatabase(): PrismaClient {
  // A regenerated Prisma module can arrive through development hot reload while
  // globalThis still holds a client constructed from the previous schema.
  const outdated = process.env.NODE_ENV === "development" && globalDatabase.prismaConstructor !== PrismaClient;
  if (!globalDatabase.prisma || outdated) {
    const adapter = new PrismaPg({
      connectionString: databaseConnectionString(process.env),
      // Small personal MVP: bound connections per serverless instance. The
      // driver queues concurrent queries; never multiplex wire-protocol clients.
      max: 1,
      connectionTimeoutMillis: connectionWaitMs,
      idleTimeoutMillis: 30_000,
    });
    globalDatabase.prisma = new PrismaClient({
      adapter,
      // A transaction may queue behind another request on the sole connection.
      // Give it the same acquisition window as pg before its own work begins.
      transactionOptions: { maxWait: connectionWaitMs },
    });
    globalDatabase.prismaConstructor = PrismaClient;
  }
  return globalDatabase.prisma;
}
