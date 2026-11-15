import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function createTestDatabase() {
  const embedded = await PGlite.create();
  const root = join(process.cwd(), "prisma", "migrations");
  for (const directory of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await embedded.exec(await readFile(join(root, directory.name, "migration.sql"), "utf8"));
  }
  // pg replaces pooled connections after expected SQL constraint errors. Allow
  // a replacement to connect while the previous TCP socket finishes closing;
  // Prisma still serializes database work through its single-connection pool.
  const socket = new PGLiteSocketServer({ db: embedded, host: "127.0.0.1", port: 0, maxConnections: 2 });
  await socket.start();
  const connectionString = `postgresql://postgres@${socket.getServerConn()}/postgres?sslmode=disable`;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  return {
    embedded, socket, prisma, connectionString,
    close: async () => { await prisma.$disconnect(); await socket.stop(); await embedded.close(); },
  };
}
