"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AccessError, requireUser } from "@/lib/auth/session";
import { createBill, createBudget, createCategory, createTransaction, deleteBill, deleteBudget, deleteCategory, deleteTransaction, FinanceError, recordBillPayment, updateBill, updateBudget, updateCategory, updateTransaction } from "@/lib/finance/dal";

export type MutationState = { message: string; ok: boolean };

export async function mutateFinance(_previous: MutationState, form: FormData): Promise<MutationState> {
  let redirectTo: string | undefined;
  try {
    const user = await requireUser();
    const operation = z.enum(["createCategory", "updateCategory", "deleteCategory", "createTransaction", "updateTransaction", "deleteTransaction", "createBudget", "updateBudget", "deleteBudget", "createBill", "updateBill", "deleteBill", "recordBillPayment"]).parse(form.get("operation"));
    const id = z.string().max(100).parse(form.get("id") ?? "");
    const fields = (names: string[]) => Object.fromEntries(names.map((name) => [name, form.get(name)]));
    switch (operation) {
      case "createCategory": await createCategory(user.id, fields(["name", "transactionType"])); break;
      case "updateCategory": await updateCategory(user.id, id, fields(["name", "transactionType"])); break;
      case "deleteCategory": await deleteCategory(user.id, id); break;
      case "createTransaction": await createTransaction(user.id, fields(["amount", "type", "categoryId", "description", "occurredOn"])); break;
      case "updateTransaction": await updateTransaction(user.id, id, fields(["amount", "type", "categoryId", "description", "occurredOn"])); break;
      case "deleteTransaction": await deleteTransaction(user.id, id); redirectTo = "/transactions"; break;
      case "createBudget": await createBudget(user.id, fields(["categoryId", "period", "limitAmount", "warningAt"])); break;
      case "updateBudget": await updateBudget(user.id, id, fields(["categoryId", "period", "limitAmount", "warningAt"])); break;
      case "deleteBudget": await deleteBudget(user.id, id); break;
      case "createBill": await createBill(user.id, fields(["name", "amount", "categoryId", "cadence", "nextDueOn", "active"])); break;
      case "updateBill": await updateBill(user.id, id, form.get("version"), fields(["name", "amount", "categoryId", "cadence", "nextDueOn", "active"])); break;
      case "deleteBill": await deleteBill(user.id, id, form.get("version")); break;
      case "recordBillPayment": {
        const payment = await recordBillPayment(user.id, id, form.get("version"), fields(["amount", "description", "occurredOn"]));
        redirectTo = `/transactions/${payment.id}`;
        break;
      }
    }
    revalidatePath("/dashboard");
    revalidatePath("/categories");
    revalidatePath("/transactions");
    revalidatePath("/transactions/[id]", "page");
    revalidatePath("/budgets");
    revalidatePath("/bills");
    revalidatePath("/bills/[id]/payment", "page");
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, message: "Sesi tidak sah. Sila log masuk semula." };
    if (error instanceof z.ZodError) return { ok: false, message: "Input tidak sah. Semak amaun, tarikh, kategori dan medan wajib." };
    if (error instanceof FinanceError) {
      const messages = {
        CATEGORY_MISMATCH: "Kategori tidak sepadan dengan jenis transaksi atau tidak tersedia.",
        DEMO_READ_ONLY: "Akaun demo hanya boleh dibaca.",
        NOT_FOUND: "Rekod tidak ditemui atau tidak tersedia.",
        BILL_CHANGED: "Bil ini sudah dikemas kini atau tidak tersedia. Muat semula sebelum mencuba lagi.",
      };
      return { ok: false, message: messages[error.code] };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, message: "Kategori atau bajet bagi bulan ini sudah wujud." };
      if (["P2003", "P2014"].includes(error.code)) return { ok: false, message: "Kategori masih digunakan atau tidak sepadan. Semak transaksi, bajet dan bil yang berkaitan dahulu." };
    }
    // Never return/log raw database exceptions or financial form contents.
    return { ok: false, message: "Perubahan tidak dapat disimpan. Sila cuba lagi." };
  }
  if (redirectTo) redirect(redirectTo);
  return { ok: true, message: "Perubahan disimpan." };
}
