import "server-only";
import { requireUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";

export async function getUserProfile(userId: string) {
  await requireUser(userId);
  return getDatabase().user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, aiParsingEnabled: true,
      categories: {
        where: { userId },
        select: { id: true, name: true, transactionType: true },
        orderBy: [{ transactionType: "asc" }, { name: "asc" }],
      },
    },
  });
}
