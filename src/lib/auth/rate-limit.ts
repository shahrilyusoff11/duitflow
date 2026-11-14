import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { PrismaClient } from "@/generated/prisma/client";

export function authRateLimitKey(headers: Headers, secret: string, onVercel: boolean): string {
  // Only trust the platform header when actually running behind Vercel. On
  // other hosts use one shared bucket until a trusted proxy is configured.
  const supplied = onVercel ? headers.get("x-vercel-forwarded-for") : null;
  const identity = supplied && isIP(supplied) ? supplied : "shared-untrusted-origin";
  return createHmac("sha256", secret).update(`auth-ip:${identity}`).digest("hex");
}

export async function consumeAuthAttempt(database: PrismaClient, key: string, bucket: string, maximum = 10): Promise<boolean> {
  return database.$transaction(async (tx) => {
    // Serialize check+insert across processes for this key/bucket. Parameterized
    // static SQL only; no model-generated SQL or identity values in logs.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${key}:${bucket}`}, 0))::text`;
    const since = new Date(Date.now() - 60_000);
    const count = await tx.rateLimitEvent.count({ where: { key, bucket, createdAt: { gt: since } } });
    if (count >= maximum) return false;
    await tx.rateLimitEvent.create({ data: { key, bucket } });
    // Bounded lazy cleanup, no cron or persistent worker required.
    await tx.$executeRaw`DELETE FROM "RateLimitEvent" WHERE "id" IN (
      SELECT "id" FROM "RateLimitEvent" WHERE "createdAt" < now() - interval '1 day' LIMIT 100
    )`;
    return true;
  });
}
