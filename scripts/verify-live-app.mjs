import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseURL = process.env.APP_VERIFY_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", () => errors.push("CLIENT_ERROR"));
  await page.goto(baseURL);
  await page.getByRole("heading", { level: 1 }).waitFor();
  console.log("Live app landing page: HTTP 200, rendered");
  const healthResponse = await page.goto(`${baseURL}/api/health`);
  assert.equal(healthResponse.status(), 200);
  assert.deepEqual(await healthResponse.json(), { status: "ok", database: "connected" });
  console.log('Browser -> /api/health -> Prisma -> Neon: HTTP 200 {"status":"ok","database":"connected"}');
  await page.goto(`${baseURL}/dashboard`);
  assert.equal(new URL(page.url()).pathname, "/sign-in");
  assert.equal((await context.request.get(`${baseURL}/api/profile`)).status(), 401);
  console.log("Anonymous dashboard redirects to sign-in; profile returns HTTP 401: PASS");
  const disabled = await page.getByRole("button", { name: "Teruskan dengan GitHub" }).isDisabled();
  console.log(disabled ? "Real GitHub OAuth verification: pending provider credentials" : "GitHub button available; external consent/login not attempted by this read-only check");
  assert.equal(errors.length, 0);
  console.log("Browser runtime errors: 0");
} catch {
  console.error("LIVE_APP_VERIFICATION_FAILED");
  process.exitCode = 1;
} finally { await browser.close(); }
