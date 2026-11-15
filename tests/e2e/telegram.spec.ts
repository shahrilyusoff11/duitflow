import { expect, test, type BrowserContext } from "@playwright/test";
import { fixtureSessionCookie } from "../helpers/session-cookie";

async function signIn(context: BrowserContext, identity: string) {
  const cookie = fixtureSessionCookie(`browser-token-${identity}`, "synthetic-browser-test-secret-at-least-32-characters");
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
}

test("settings generates an expiring single-use Telegram deep link", async ({ page, context }, testInfo) => {
  const device = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  await signIn(context, `telegram-${device}`);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Tetapan", exact: true })).toBeVisible();
  const connection = page.getByRole("region", { name: "Sambungan Telegram", exact: true });
  await expect(connection).toContainText("Belum disambungkan");
  await page.screenshot({ path: testInfo.outputPath("telegram-settings.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Jana pautan Telegram", exact: true }).click();
  const link = page.getByRole("link", { name: "Buka bot untuk pautkan Telegram", exact: true });
  await expect(link).toHaveAttribute("href", /^https:\/\/t\.me\/DuitFlowTestBot\?start=[A-Za-z0-9_-]{32,64}$/);
  const first = await link.getAttribute("href");
  await expect(page.getByRole("status")).toContainText("10 minit");
  await page.getByRole("button", { name: "Jana pautan Telegram", exact: true }).click();
  await expect(link).not.toHaveAttribute("href", first!);
  await page.reload();
  await expect(link).toHaveCount(0);
  await expect(connection).toContainText("Belum disambungkan");
});

test("settings requires explicit unlink confirmation and allows a fresh link", async ({ page, context }, testInfo) => {
  const device = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  await signIn(context, `telegram-linked-${device}`);
  await page.goto("/settings");
  const connection = page.getByRole("region", { name: "Sambungan Telegram", exact: true });
  await expect(connection.getByText("Disambungkan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Putuskan sambungan Telegram", exact: true }).click();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(connection.getByText("Disambungkan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Putuskan sambungan Telegram", exact: true }).click();
  await page.getByRole("button", { name: "Sahkan putuskan sambungan", exact: true }).click();
  await expect(connection).toContainText("Belum disambungkan");
  await expect(page.getByRole("status")).toContainText("Sambungan Telegram diputuskan");
  await page.getByRole("button", { name: "Jana pautan Telegram", exact: true }).click();
  await expect(page.getByRole("link", { name: "Buka bot untuk pautkan Telegram", exact: true })).toBeVisible();
});

test("settings rejects anonymous access", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in$/);
});
