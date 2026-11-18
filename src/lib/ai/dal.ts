import "server-only";
import { z } from "zod";
import { requireUser, AccessError } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import { idSchema } from "@/lib/finance/validation";

export async function getAiSettings(userId: string) {
  await requireUser(userId);
  idSchema.parse(userId);
  return getDatabase().user.findUniqueOrThrow({ where: { id: userId }, select: { deepseekParsingEnabled: true, isDemo: true } });
}

export async function setAiConsent(userId: string, enabled: boolean) {
  await requireUser(userId);
  idSchema.parse(userId);
  z.boolean().parse(enabled);
  await getDatabase().$transaction(async (tx) => {
    // Serialize with bot dispatch permission. Consent withdrawal takes effect on
    // subsequent dispatches; it cannot recall a request already sent to DeepSeek.
    const rows = await tx.$queryRaw<Array<{ isDemo: boolean }>>`SELECT "isDemo" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!rows[0] || rows[0].isDemo) throw new AccessError("FORBIDDEN");
    await tx.user.update({ where: { id: userId }, data: { deepseekParsingEnabled: enabled } });
  });
}
