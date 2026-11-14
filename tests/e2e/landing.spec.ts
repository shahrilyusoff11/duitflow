import { expect, test } from "@playwright/test";

test("Malay landing page supports keyboard navigation and working section links", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
  await expect(page.locator("html")).toHaveAttribute("lang", "ms-MY");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kewangan harian,");
  await expect(page.getByText("Akan datang", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Langkau ke kandungan" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#kandungan$/);
  await page.getByRole("link", { name: "Lihat cara ia berfungsi" }).click();
  await expect(page).toHaveURL(/#cara$/);
  await expect(page.getByRole("heading", { name: "Tabiat kecil. Gambaran lebih jelas." })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("anonymous visitors cannot access the dashboard or profile", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Teruskan dengan GitHub" })).toBeVisible();
  expect((await request.get("/api/profile")).status()).toBe(401);
});
