import { expect, test } from "@playwright/test";

test("public demo shows exact synthetic totals and remains read-only", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (event) => {
    if (event.method() !== "GET" && event.method() !== "HEAD") mutations.push(event.url());
  });

  await page.goto("/demo");
  await expect(page).toHaveTitle("Demo baca sahaja — DuitFlow");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo baca sahaja.");
  await expect(page.getByText("Semua angka dan catatan di sini ialah data rekaan", { exact: false })).toBeVisible();
  const summary = page.locator("#ringkasan .summary-grid");
  await expect(summary.locator(".net-panel .metric-amount")).toHaveText("RM 3,104.50");
  await expect(summary.locator(".flow-income .metric-amount")).toHaveText("RM 3,740.00");
  await expect(summary.locator(".flow-expense .metric-amount")).toHaveText("RM 635.50");
  await expect(summary.locator(".flow-expense .flow-label p")).toHaveText("Bulan lalu RM 2,030.50");
  await expect(page.locator("#transaksi .record-list > li")).toHaveCount(8);
  await expect(page.getByRole("progressbar", { name: "Penggunaan bajet Makanan" })).toHaveAttribute("value", "88.1");
  await expect(page.locator("#bajet")).toContainText("−RM 20.00");
  await expect(page.locator("form, input, select, textarea, button")).toHaveCount(0);
  await expect(page.locator('a[href^="/transactions"], a[href^="/settings"], a[href^="https://t.me"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("demo.png"), fullPage: true });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Langkau ke kandungan" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const chartValues = page.locator(".chart-data");
  await chartValues.locator("summary").press("Enter");
  await expect(chartValues.getByRole("row").last()).toContainText("RM 3,740.00");
  await chartValues.locator("summary").press("Enter");
  await page.getByRole("link", { name: "Bajet contoh", exact: true }).click();
  await expect(page).toHaveURL(/\/demo#bajet$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);

  // Viewing the public snapshot must never create an authenticated session.
  expect((await page.request.get("/api/profile")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});
