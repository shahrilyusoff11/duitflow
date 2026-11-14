import { z } from "zod";

const postgresUrl = z.string().url().refine(
  (value) => /^postgres(?:ql)?:\/\//i.test(value),
);

export function databaseConnectionString(
  environment: Record<string, string | undefined>,
): string {
  const result = postgresUrl.safeParse(environment.DATABASE_URL);
  if (!result.success) {
    // Do not include the supplied value or validation issues: URLs hold secrets.
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  return result.data;
}

export function migrationConnectionString(environment: Record<string, string | undefined>): string {
  // Neon CLI owns DATABASE_URL_UNPOOLED. Preserve DIRECT_URL as a conventional
  // non-Neon alias, without replacing either value in the user's environment.
  const value = environment.DATABASE_URL_UNPOOLED || environment.DIRECT_URL;
  if (!value) return ""; // Offline generate/validate/build need no database.
  const result = postgresUrl.safeParse(value);
  if (!result.success || new URL(result.data).hostname.includes("-pooler")) {
    throw new Error("Migrations require a valid direct PostgreSQL URL in DATABASE_URL_UNPOOLED or DIRECT_URL.");
  }
  return result.data;
}
