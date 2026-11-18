import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createTestDatabase } from "../helpers/database";
const context = vi.hoisted(() => ({ database: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => context.database }));
import { claimTelegramUpdate, cleanupTelegramState, finishTelegramUpdate, TELEGRAM_LEASE_MS, TelegramUpdateBusyError } from "../../src/lib/telegram/state";
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => { db = await createTestDatabase(); context.database = db.prisma; });
beforeEach(async () => {
  await db.prisma.telegramUpdate.deleteMany();
  await db.prisma.rateLimitEvent.deleteMany();
});
afterAll(async () => { await db?.close(); });

describe("durable Telegram update leases", () => {
  it("claims only one concurrent delivery and ignores DONE replays", async () => {
    const claims = await Promise.allSettled([claimTelegramUpdate(100), claimTelegramUpdate(100), claimTelegramUpdate(100)]);
    const success = claims.filter((result) => result.status === "fulfilled");
    expect(success).toHaveLength(1);
    expect(claims.filter((result) => result.status === "rejected")).toHaveLength(2);
    const lease = success[0].value!;
    await expect(claimTelegramUpdate(100)).rejects.toBeInstanceOf(TelegramUpdateBusyError);
    await finishTelegramUpdate(lease, "DONE");
    expect(await claimTelegramUpdate(100)).toBeNull();
    expect(await db.prisma.telegramUpdate.findUniqueOrThrow({ where: { telegramUpdateId: 100 } })).toMatchObject({ status: "DONE", attempts: 1, lockedAt: null });
  });
  it("retries FAILED delivery after a simulated timeout", async () => {
    const first = (await claimTelegramUpdate(101))!;
    await finishTelegramUpdate(first, "FAILED");
    const retry = (await claimTelegramUpdate(101))!;
    expect(retry.attempt).toBe(2);
    await finishTelegramUpdate(retry, "DONE");
    expect(await claimTelegramUpdate(101)).toBeNull();
  });
  it("reclaims stale locks and fences the old worker's completion", async () => {
    const now = new Date();
    const first = (await claimTelegramUpdate(102, new Date(now.getTime() - TELEGRAM_LEASE_MS - 1)))!;
    const retry = (await claimTelegramUpdate(102, now))!;
    expect(retry.attempt).toBe(2);
    expect(await finishTelegramUpdate(first, "DONE")).toBe(false);
    expect((await db.prisma.telegramUpdate.findUniqueOrThrow({ where: { telegramUpdateId: 102 } })).status).toBe("PROCESSING");
    expect(await finishTelegramUpdate(retry, "DONE")).toBe(true);
    expect(await finishTelegramUpdate(first, "FAILED")).toBe(false);
    expect((await db.prisma.telegramUpdate.findUniqueOrThrow({ where: { telegramUpdateId: 102 } })).status).toBe("DONE");
  });
  it("claims RECEIVED updates and validates IDs", async () => {
    await db.prisma.telegramUpdate.create({ data: { telegramUpdateId: 103 } });
    expect((await claimTelegramUpdate(103))?.attempt).toBe(1);
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await expect(claimTelegramUpdate(value)).rejects.toThrow("INVALID_TELEGRAM_UPDATE_ID");
  });
  it("bounds lazy cleanup and ages out abandoned metadata without deleting recent failures", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    await db.prisma.telegramUpdate.createMany({ data: Array.from({ length: 105 }, (_, index) => ({ telegramUpdateId: index, status: "DONE" as const, updatedAt: old })) });
    await db.prisma.telegramUpdate.createMany({ data: [{ telegramUpdateId: 200, status: "FAILED", updatedAt: old }, { telegramUpdateId: 201, status: "PROCESSING", updatedAt: old }] });
    await db.prisma.telegramUpdate.create({ data: { telegramUpdateId: 202, status: "FAILED" } });
    await cleanupTelegramState();
    expect(await db.prisma.telegramUpdate.count()).toBe(8);
    await cleanupTelegramState();
    expect(await db.prisma.telegramUpdate.findMany()).toMatchObject([{ telegramUpdateId: BigInt(202) }]);
  });
  it("limits new sender traffic while allowing admitted retries and separate approval capacity", async () => {
    const now = new Date();
    const traffic = { sender: "12345", kind: "message" as const, secret: "synthetic-hmac-key" };
    for (let index = 0; index < 12; index++) expect(await claimTelegramUpdate(index, now, traffic)).not.toBeNull();
    expect(await claimTelegramUpdate(12, now, traffic)).toBeNull();
    expect(await db.prisma.telegramUpdate.count()).toBe(12);
    expect(await claimTelegramUpdate(13, now, { ...traffic, kind: "callback" })).not.toBeNull();
    await expect(claimTelegramUpdate(0, now, traffic)).rejects.toBeInstanceOf(TelegramUpdateBusyError);
    expect((await claimTelegramUpdate(0, new Date(now.getTime() + TELEGRAM_LEASE_MS), traffic))?.attempt).toBe(2);
  });
  it("retains pending-action replay tombstones for seven days after expiry", async () => {
    const user = await db.prisma.user.create({ data: { name: "Synthetic cleanup", email: `cleanup-${crypto.randomUUID()}@example.test` } });
    const record = { userId: user.id, telegramUserId: "12345", kind: "PROPOSAL" as const, payload: {}, consumedAt: new Date() };
    const old = await db.prisma.pendingTelegramAction.create({ data: { ...record, expiresAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) } });
    const recent = await db.prisma.pendingTelegramAction.create({ data: { ...record, expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60_000) } });
    await cleanupTelegramState();
    expect(await db.prisma.pendingTelegramAction.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.prisma.pendingTelegramAction.findUnique({ where: { id: recent.id } })).toMatchObject({ payload: null });
  });
});
