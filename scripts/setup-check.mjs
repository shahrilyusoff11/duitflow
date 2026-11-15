import "dotenv/config";
import { readAuthEnvironment } from "../src/lib/config/auth.ts";
import { databaseConnectionString, migrationConnectionString } from "../src/lib/config/database.ts";
import { getTelegramConfig } from "../src/lib/config/telegram.ts";
import { readAiEnvironment } from "../src/lib/config/ai.ts";

const required = ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];
const missing = required.filter((name) => !process.env[name] || /USER:PASSWORD|@HOST|replace-with/.test(process.env[name]));
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL;
if (!direct || /USER:PASSWORD|@HOST|replace-with/.test(direct)) missing.push("DATABASE_URL_UNPOOLED (or DIRECT_URL)");
try {
  if (missing.length) throw new Error("Missing values");
  readAuthEnvironment(process.env);
  databaseConnectionString(process.env);
  migrationConnectionString(process.env);
  if (["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_USERNAME"].some((name) => process.env[name])) getTelegramConfig(process.env);
  readAiEnvironment(process.env);
  console.log("Required configuration is present and valid. This does not verify provider credentials or database connectivity.");
} catch {
  console.error(missing.length ? `Configure locally in .env: ${missing.join(", ")}` : "Authentication, PostgreSQL or optional Telegram/AI configuration format is invalid. Check docs/SETUP.md, docs/TELEGRAM_SETUP.md and docs/AI_SETUP.md.");
  process.exitCode = 1;
}
