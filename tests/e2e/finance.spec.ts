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
  await expect(page.getByRole("navigation", { name: "Navigasi kewangan" }).getByRole("link", { name: "Kategori", exact: true })).toHaveAttribute("aria-current", "page");
  const createCategory = page.locator("form").filter({ has: page.getByRole("button", { name: "Tambah kategori", exact: true }) });
  await createCategory.getByLabel("Nama kategori").fill("Synthetic food");
  await createCategory.getByRole("button", { name: "Tambah kategori", exact: true }).click();
  const category = page.getByRole("region", { name: "Kategori Synthetic food", exact: true });
  await expect(category).toBeVisible();
  await category.locator("summary").click();
  await category.getByLabel("Nama kategori").fill("Synthetic meals");
  await category.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("region", { name: "Kategori Synthetic meals", exact: true }).locator("summary")).toHaveText("Synthetic meals");

  await page.goto("/transactions");
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Tambah transaksi", exact: true }) });
  const entryCategory = add.getByRole("combobox", { name: "Kategori", exact: true });
  const entryType = add.getByRole("combobox", { name: "Jenis", exact: true });
  await expect(entryCategory.getByRole("option", { name: "Gaji", exact: true })).toHaveCount(0);
  await entryCategory.selectOption({ label: "Synthetic meals" });
  await entryType.selectOption("INCOME");
  await expect(entryCategory).toHaveValue("");
  await expect(entryCategory.getByRole("option", { name: "Synthetic meals" })).toHaveCount(0);
  await entryCategory.selectOption({ label: "Gaji" });
  await entryType.selectOption("EXPENSE");
  await expect(entryCategory).toHaveValue("");
  await entryCategory.selectOption({ label: "Synthetic meals" });
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
  const filter = page.locator("#rekod form");
  const filterCategory = filter.getByRole("combobox", { name: "Kategori", exact: true });
  const filterType = filter.getByRole("combobox", { name: "Jenis", exact: true });
  await expect(filterCategory.getByRole("option", { name: "Gaji", exact: true })).toHaveCount(0);
  const [selectedCategory] = await filterCategory.selectOption({ label: "Synthetic meals" });
  await filterType.selectOption("");
  await expect(filterCategory).toHaveValue(selectedCategory);
  await filterType.selectOption("INCOME");
  await expect(filterCategory).toHaveValue("");
  await filter.getByRole("button", { name: "Tapis" }).click();
  await expect(page.getByText("Tiada transaksi sepadan dengan penapis anda.")).toBeVisible();
  await filter.getByRole("link", { name: "Tetapkan semula" }).click();
  await page.getByRole("link", { name: "Synthetic lunch", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Butiran transaksi", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigasi kewangan" }).getByRole("link", { name: "Transaksi", exact: true })).toHaveAttribute("aria-current", "page");
  const editCategory = page.getByRole("combobox", { name: "Kategori", exact: true });
  await expect(editCategory).toHaveValue(selectedCategory);
  await page.getByRole("combobox", { name: "Jenis", exact: true }).selectOption("INCOME");
  await expect(editCategory).toHaveValue("");
  await expect(editCategory.getByRole("option", { name: "Synthetic meals" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Jenis", exact: true }).selectOption("EXPENSE");
  await editCategory.selectOption({ label: "Synthetic meals" });
  await page.getByLabel("Amaun (MYR)").fill("12 ringgit 50 sen");
  await page.getByRole("button", { name: "Simpan transaksi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Perubahan disimpan.");
  await page.goto("/dashboard?month=2026-11");
  await expect(expense).toContainText("RM 12.50");
  await page.goto("/dashboard?month=2026-10");
  await expect(expense).toContainText("RM 0.00");

  await page.goto("/categories");
  const usedCategory = page.getByRole("region", { name: "Kategori Synthetic meals", exact: true });
  await usedCategory.locator("summary").click();
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
  await usedCategory.locator("summary").click();
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

test("dashboard activity shows five linked records and an empty budget for the selected month", async ({ page, context }, testInfo) => {
  const device = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const cookie = fixtureSessionCookie(`browser-token-activity-${device}`, "synthetic-browser-test-secret-at-least-32-characters");
  const separator = cookie.indexOf("=");
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  const entries = [
    ["Gaji contoh", "Gaji", "INCOME", "3000"],
    ["Tambang tren contoh", "Pengangkutan", "EXPENSE", "6.40"],
    ["Makan tengah hari contoh", "Makanan & Minuman", "EXPENSE", "14"],
    ["Tiket wayang contoh", "Hiburan", "EXPENSE", "22"],
    ["Barang dapur contoh", "Keperluan Rumah", "EXPENSE", "48.50"],
  ];
  await page.goto("/transactions");
  const add = page.locator("#tambah form");
  for (const [index, [description, category, type, amount]] of entries.entries()) {
    await add.getByRole("combobox", { name: "Jenis", exact: true }).selectOption(type);
    await add.getByRole("combobox", { name: "Kategori", exact: true }).selectOption({ label: category });
    await add.getByLabel("Amaun (MYR)").fill(amount);
    await add.getByLabel("Keterangan").fill(description);
    await add.getByLabel("Tarikh").fill(`2026-08-0${index + 1}`);
    await add.getByRole("button", { name: "Tambah transaksi" }).click();
    await expect(page.getByRole("link", { name: description, exact: true })).toBeVisible();
    await expect(add.getByRole("combobox", { name: "Jenis", exact: true })).toHaveValue("EXPENSE");
    await expect(add.getByRole("combobox", { name: "Kategori", exact: true })).toHaveValue("");
  }
  await page.screenshot({ path: testInfo.outputPath("transactions.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.goto("/dashboard?month=2026-08");
  const activity = page.locator(".dashboard-activity");
  const ledger = activity.getByRole("region", { name: "Transaksi terkini" });
  await expect(ledger.getByRole("listitem")).toHaveCount(5);
  await expect(ledger.getByRole("listitem").first()).toContainText("−RM 48.50");
  await expect(ledger.getByRole("listitem").last()).toContainText("+RM 3,000.00");
  await expect(activity.getByRole("link", { name: "Tetapkan bajet" })).toHaveAttribute("href", "/budgets?month=2026-08");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await activity.screenshot({ path: testInfo.outputPath("dashboard-activity.png") });
  await ledger.getByRole("link", { name: /Barang dapur contoh/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "Butiran transaksi" })).toBeVisible();
});
