import { expect, test } from "@playwright/test";
import { fixtureSessionCookie } from "../helpers/session-cookie";

test("web finance CRUD updates monthly totals and budget warnings", async ({ page, context }, testInfo) => {
  const device = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const cookie = fixtureSessionCookie(`browser-token-finance-${device}`, "synthetic-browser-test-secret-at-least-32-characters");
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/categories");
  const createCategory = page.locator("form").filter({ has: page.getByRole("button", { name: "Tambah kategori", exact: true }) });
  await createCategory.getByLabel("Nama kategori").fill("Synthetic food");
  await createCategory.getByRole("button", { name: "Tambah kategori", exact: true }).click();
  const category = page.getByRole("region", { name: "Kategori Synthetic food", exact: true });
  await expect(category).toBeVisible();
  await category.getByLabel("Nama kategori").fill("Synthetic meals");
  await category.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic meals", exact: true })).toBeVisible();

  await page.goto("/transactions");
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Tambah transaksi", exact: true }) });
  await add.getByRole("combobox", { name: "Kategori", exact: true }).selectOption({ label: "Synthetic meals (Perbelanjaan)" });
  await add.getByLabel("Amaun (MYR)").fill("RM80");
  await add.getByLabel("Keterangan", { exact: true }).fill("Synthetic lunch");
  await add.getByLabel("Tarikh", { exact: true }).fill("2026-11-01");
  await add.getByRole("button", { name: "Tambah transaksi", exact: true }).click();
  await expect(page.getByRole("link", { name: "Synthetic lunch", exact: true })).toBeVisible();

  await page.goto("/budgets?month=2026-11");
  const addBudget = page.locator("form").filter({ has: page.getByRole("button", { name: "Tambah bajet", exact: true }) });
  await addBudget.getByRole("combobox", { name: "Kategori", exact: true }).selectOption({ label: "Synthetic meals (Perbelanjaan)" });
  await addBudget.getByLabel("Had (MYR)").fill("100");
  await addBudget.getByRole("button", { name: "Tambah bajet", exact: true }).click();
  const budget = page.getByRole("region", { name: "Bajet Synthetic meals", exact: true });
  await expect(budget.getByText("Amaran: sekurang-kurangnya 80% telah digunakan.")).toBeVisible();
  await budget.getByText("Ubah bajet", { exact: true }).click();
  await budget.getByLabel("Had (MYR)").fill("50");
  await budget.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(budget.getByText("Had bajet dicapai atau dilebihi (100%).")).toBeVisible();

  await page.goto("/dashboard?month=2026-11");
  const expense = page.locator(".summary-grid section").filter({ has: page.getByRole("heading", { name: "Perbelanjaan", exact: true }) });
  await expect(expense).toContainText("RM 80.00");
  await expect(page.locator(".summary-grid")).toContainText("−RM 80.00");
  await page.screenshot({ path: testInfo.outputPath("finance-dashboard.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.goto("/transactions?from=2026-11-01&to=2026-11-30&type=EXPENSE&search=Synthetic");
  await page.getByRole("link", { name: "Synthetic lunch", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Butiran transaksi", exact: true })).toBeVisible();
  await page.getByLabel("Amaun (MYR)").fill("12 ringgit 50 sen");
  await page.getByRole("button", { name: "Simpan transaksi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Perubahan disimpan.");
  await page.goto("/dashboard?month=2026-11");
  await expect(expense).toContainText("RM 12.50");
  await page.goto("/dashboard?month=2026-10");
  await expect(expense).toContainText("RM 0.00");

  await page.goto("/categories");
  const usedCategory = page.getByRole("region", { name: "Kategori Synthetic meals", exact: true });
  await usedCategory.getByRole("button", { name: "Padam kategori", exact: true }).click();
  await usedCategory.getByRole("button", { name: "Sahkan padam", exact: true }).click();
  await expect(usedCategory.getByRole("alert")).toContainText("Kategori masih digunakan");

  await page.goto("/budgets?month=2026-11");
  await budget.getByRole("button", { name: "Padam bajet", exact: true }).click();
  await budget.getByRole("button", { name: "Sahkan padam", exact: true }).click();
  await expect(budget).toHaveCount(0);
  await page.goto("/transactions");
  await page.getByRole("link", { name: "Synthetic lunch", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Butiran transaksi", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Padam transaksi", exact: true }).click();
  await page.getByRole("button", { name: "Sahkan padam", exact: true }).click();
  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: "Synthetic lunch", exact: true })).toHaveCount(0);
  await page.goto("/categories");
  await usedCategory.getByRole("button", { name: "Padam kategori", exact: true }).click();
  await usedCategory.getByRole("button", { name: "Sahkan padam", exact: true }).click();
  await expect(usedCategory).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("finance pages independently reject anonymous access", async ({ page }) => {
  for (const path of ["/transactions", "/transactions/unknown", "/budgets", "/categories"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});
