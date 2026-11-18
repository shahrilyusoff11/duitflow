import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Test-only launcher. Never imported by the application or used by npm run dev.
// All credentials and identities are synthetic. No test endpoint is deployed.
const require = createRequire(import.meta.url);
const embedded = await PGlite.create();
const socket = new PGLiteSocketServer({ db: embedded, host: "127.0.0.1", port: 0, maxConnections: 10 });
await socket.start();
const connectionString = `postgresql://postgres@${socket.getServerConn()}/postgres?sslmode=disable`;
const environment = {
  ...process.env,
  DATABASE_URL: connectionString, DATABASE_URL_UNPOOLED: connectionString, DIRECT_URL: connectionString,
  BETTER_AUTH_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET: "synthetic-browser-test-secret-at-least-32-characters",
  GITHUB_CLIENT_ID: "synthetic-browser-client",
  GITHUB_CLIENT_SECRET: "synthetic-browser-client-secret",
  TELEGRAM_BOT_TOKEN: "123456:synthetic-telegram-token-longer-than-twenty",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-telegram-webhook-secret-longer-than32",
  TELEGRAM_BOT_USERNAME: "DuitFlowTestBot",
  AI_PROVIDER: "deterministic", DEEPSEEK_API_KEY: "",
  DEEPSEEK_MODEL: "deepseek-flash", AI_DAILY_LIMIT_PER_USER: "30", AI_MINUTE_LIMIT_PER_USER: "2",
  NEXT_TELEMETRY_DISABLED: "1", VERCEL: "",
};

let application;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  application?.kill();
  await socket.stop();
  await embedded.close();
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  // Prisma's real migration command runs through the PostgreSQL wire protocol.
  // The server must remain asynchronous while the child connects to it.
  const prismaPackagePath = require.resolve("prisma/package.json");
  const prismaCli = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, "utf8")).bin.prisma);
  const migrate = spawn(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: environment, stdio: "inherit", windowsHide: true,
  });
  const migrationCode = await new Promise((resolve, reject) => {
    migrate.on("error", reject);
    migrate.on("exit", resolve);
  });
  if (migrationCode !== 0) throw new Error("Browser test migration failed");

  for (const project of ["desktop", "mobile", "finance-desktop", "finance-mobile", "activity-desktop", "activity-mobile", "bills-desktop", "bills-mobile", "telegram-desktop", "telegram-mobile", "telegram-linked-desktop", "telegram-linked-mobile", "telegram-confirm-desktop", "telegram-confirm-mobile", "ai-desktop", "ai-mobile"]) {
    await embedded.query(`INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES ($1, $2, $3, now())`,
      [`browser-${project}`, `${project === "desktop" ? "Desktop" : "Mobile"} Test`, `${project}@example.test`]);
    await embedded.query(`INSERT INTO "Session" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
      [`browser-session-${project}`, `browser-token-${project}`, `browser-${project}`]);
  }
  for (const device of ["desktop", "mobile"]) {
    const userId = `browser-activity-${device}`;
    await embedded.query(`INSERT INTO "Budget" ("id", "userId", "categoryId", "year", "month", "limitAmount", "updatedAt") VALUES
      ($1 || ':budget-food', $1, $1 || ':default:food', 2026, 8, 15, now()),
      ($1 || ':budget-home', $1, $1 || ':default:home', 2026, 8, 100, now())`, [userId]);
    await embedded.query(`
      INSERT INTO "RecurringBill" ("id", "userId", "categoryId", "name", "amount", "cadence", "nextDueOn", "dayOfMonth", "updatedAt")
      SELECT $1 || ':bill:' || offset_days, $1, $1 || ':default:bills', name, amount, 'YEARLY',
             due_on, extract(day from due_on), now()
      FROM (VALUES ('Ansuran kereta', 720, 2), ('Internet rumah', 139, 5),
                   ('Bil elektrik', 125.50, 9), ('Insurans kenderaan', 1050, 21)) AS bills(name, amount, offset_days)
      CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + offset_days AS due_on) AS schedule
    `, [userId]);
  }
  for (const [device, telegramUserId] of [["desktop", "900000001"], ["mobile", "900000002"]]) {
    await embedded.query(`INSERT INTO "TelegramConnection" ("id", "userId", "telegramUserId") VALUES ($1, $2, $3)`,
      [`browser-telegram-connection-${device}`, `browser-telegram-linked-${device}`, telegramUserId]);
  }
  for (const [device, sender, digit] of [["desktop", "900000003", "3"], ["mobile", "900000004", "4"]]) {
    await embedded.query(`INSERT INTO "TelegramLinkToken" ("id", "userId", "hashedToken", "pendingTelegramUserId", "expiresAt")
      VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`, [`browser-link-${device}`, `browser-telegram-confirm-${device}`, digit.repeat(64), sender]);
  }
  application = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    env: environment, stdio: "inherit", windowsHide: true,
  });
  application.on("error", () => void stop(1));
  application.on("exit", (code) => void stop(code ?? 0));
} catch (error) {
  console.error("BROWSER_TEST_SERVER_FAILED", error instanceof Error ? error.message : "Unknown error");
  await stop(1);
}
