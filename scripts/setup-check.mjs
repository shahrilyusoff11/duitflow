import "dotenv/config";
import { readAuthEnvironment } from "../src/lib/config/auth.ts";
import { databaseConnectionString, migrationConnectionString } from "../src/lib/config/database.ts";

const required = ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];
const missing = required.filter((name) => !process.env[name] || /USER:PASSWORD|@HOST|replace-with/.test(process.env[name]));
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL;
if (!direct || /USER:PASSWORD|@HOST|replace-with/.test(direct)) missing.push("DATABASE_URL_UNPOOLED (or DIRECT_URL)");
try {
  if (missing.length) throw new Error("Missing values");
  readAuthEnvironment(process.env);
  databaseConnectionString(process.env);
  migrationConnectionString(process.env);
  console.log("Required configuration is present and valid. This does not verify provider credentials or database connectivity.");
} catch {
  console.error(missing.length ? `Configure locally in .env: ${missing.join(", ")}` : "Authentication or PostgreSQL URL format is invalid. Check docs/SETUP.md.");
  process.exitCode = 1;
}
