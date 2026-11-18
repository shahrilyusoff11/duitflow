import { expect, test } from "@playwright/test";
import { fixtureSessionCookie } from "../helpers/session-cookie";
import { resolveRelativeDate, todayInMalaysia } from "../../src/lib/finance/dates";

test("dashboard shows a recurring bill and confirmation records its actual payment", async ({ page, context }, testInfo) => {
  const device = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const cookie = fixtureSessionCookie(`browser-token-bills-${device}`, "synthetic-browser-test-secret-at-least-32-characters");
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  const dueOn = todayInMalaysia();

  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Navigasi kewangan" });
  const billsTab = nav.getByRole("link", { name: "Bil", exact: true });
  const upcoming = page.getByRole("region", { name: "Bil akan datang", exact: true });
  await billsTab.click();
  await expect(billsTab).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Tambah bil", exact: true }).click();
  await expect(page).toHaveURL(/\/bills#tambah-bil$/);
  const create = page.getByRole("region", { name: "Tambah bil", exact: true });
  await create.getByLabel("Nama bil").fill("Synthetic internet");
  await create.getByLabel("Amaun (MYR)").fill("129.00");
  await create.getByLabel("Kategori").selectOption({ label: "Bil & Utiliti (Perbelanjaan)" });
  await create.getByLabel("Kekerapan").selectOption("YEARLY");
  await create.getByLabel("Tarikh bil seterusnya").fill(dueOn);
  await create.getByRole("button", { name: "Tambah bil", exact: true }).click();
  const bill = page.getByRole("region", { name: "Bil Synthetic internet", exact: true });
  await expect(bill).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dijadualkan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("bills.png"), fullPage: true });

  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(upcoming.getByText("RM 129.00", { exact: true })).toHaveCount(2);
  await expect(upcoming.getByText("Synthetic internet", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await upcoming.screenshot({ path: testInfo.outputPath("upcoming-bills.png") });
  await upcoming.getByRole("link", { name: "Rekod bayaran Synthetic internet" }).click();
  await expect(billsTab).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Keterangan")).toHaveValue("Synthetic internet");
  await expect(page.getByLabel("Amaun (MYR)")).toHaveValue("129.00");
  await expect(page.getByLabel("Tarikh", { exact: true })).toHaveValue(dueOn);
  await page.getByLabel("Amaun (MYR)").fill("130.00");
  await page.getByRole("button", { name: "Sahkan bayaran" }).click();
  await expect(page).toHaveURL(/\/transactions\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Synthetic internet", exact: true })).toBeVisible();
  await expect(page.getByText(/RM 130\.00/)).toBeVisible();
  await expect(nav.getByRole("link", { name: "Transaksi" })).toHaveAttribute("aria-current", "page");
  const paymentUrl = page.url();

  await page.goto("/dashboard");
  await expect(upcoming).toContainText("Tiada bil dijadualkan");
  await upcoming.getByRole("link", { name: "Urus bil" }).click();
  await expect(bill.locator("time")).toHaveAttribute("datetime", new RegExp(`^${Number(dueOn.slice(0, 4)) + 1}-`));
  await bill.getByText("Ubah bil", { exact: true }).click();
  const yesterday = resolveRelativeDate("semalam");
  await bill.getByLabel("Tarikh bil seterusnya").fill(yesterday);
  await bill.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(bill.locator("time")).toHaveAttribute("datetime", yesterday);
  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await upcoming.getByRole("link", { name: "1 bil tertunggak" }).click();
  await expect(page).toHaveURL(/\/bills#tertunggak$/);
  await expect(page.getByRole("heading", { name: "Tertunggak" })).toBeVisible();
  await bill.getByText("Ubah bil", { exact: true }).click();
  await bill.getByLabel("Status").selectOption("no");
  await bill.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(bill.getByRole("link", { name: "Rekod bayaran" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dijeda" })).toBeVisible();
  await bill.getByRole("button", { name: "Padam bil", exact: true }).click();
  await bill.getByRole("button", { name: "Sahkan padam", exact: true }).click();
  await expect(bill).toHaveCount(0);
  await page.goto(paymentUrl);
  await expect(page.getByRole("heading", { name: "Synthetic internet", exact: true })).toBeVisible();

  if (device === "mobile") {
    await page.setViewportSize({ width: 320, height: 720 });
    await billsTab.click();
    await expect(billsTab).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});
