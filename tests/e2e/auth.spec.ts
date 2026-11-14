import { expect, test } from "@playwright/test";
import { fixtureSessionCookie } from "../helpers/session-cookie";

test("a real database session opens only its owner's space and sign-out revokes it", async ({ page, context }, testInfo) => {
  const project = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const cookie = fixtureSessionCookie(`browser-token-${project}`, "synthetic-browser-test-secret-at-least-32-characters");
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await expect(page.getByText(`${project}@example.test`, { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByText("Tidak aktif", { exact: true })).toBeVisible();
  const profile = await context.request.get("/api/profile?userId=someone-else");
  expect(profile.status(), await profile.text()).toBe(200);
  expect((await profile.json()).id).toBe(`browser-${project}`);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Log keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await context.request.get("/api/profile")).status()).toBe(401);
  // Replaying the old signed cookie still fails because the DB session is gone.
  expect((await context.request.get("/api/profile", { headers: { cookie } })).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("GitHub button starts the real OAuth flow without requesting repository scope", async ({ page }, testInfo) => {
  let authorization: URL | undefined;
  await page.route("https://github.com/**", async (route) => {
    authorization = new URL(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<h1>Mock GitHub authorization boundary</h1>" });
  });
  await page.goto("/sign-in");
  await page.screenshot({ path: testInfo.outputPath("sign-in.png"), fullPage: true });
  await page.getByRole("button", { name: "Teruskan dengan GitHub" }).click();
  await expect(page).toHaveURL(/https:\/\/github.com\/login\/oauth\/authorize/);
  expect(authorization?.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3100/api/auth/callback/github");
  expect(authorization?.searchParams.get("scope")).not.toContain("repo");
});
