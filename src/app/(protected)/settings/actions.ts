"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, requireUser } from "@/lib/auth/session";
import { isTelegramConfigured, telegramBotUsername } from "@/lib/config/telegram";
import { confirmTelegramLink, createLinkToken, unlinkTelegram } from "@/lib/telegram/dal";
import { setAiConsent } from "@/lib/ai/dal";

export type TelegramSettingsState = { ok: boolean; message: string; linkUrl?: string; expiresAt?: string };

export async function mutateAiConsent(_previous: { ok: boolean; message: string }, form: FormData) {
  try {
    const user = await requireUser();
    const enabled = z.enum(["enable", "disable"]).parse(form.get("operation")) === "enable";
    if (enabled) z.literal("deepseek").parse(form.get("consent"));
    await setAiConsent(user.id, enabled);
    revalidatePath("/settings");
    return { ok: true, message: enabled ? "Persetujuan AI disimpan. AI hanya digunakan apabila tersedia; semak setiap cadangan sebelum Sahkan." : "Penghuraian AI dimatikan. Mesej seterusnya menggunakan peraturan tempatan." };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? "Sila sahkan persetujuan sebelum menghidupkan AI." : "Tetapan AI tidak dapat disimpan. Semak sesi anda; akaun demo tidak dibenarkan." };
  }
}

export async function mutateTelegram(_previous: TelegramSettingsState, form: FormData): Promise<TelegramSettingsState> {
  try {
    const user = await requireUser();
    const operation = z.enum(["link", "confirmLink", "unlink"]).parse(form.get("operation"));
    if (operation === "unlink") {
      z.literal("yes").parse(form.get("confirmUnlink"));
      await unlinkTelegram(user.id);
      revalidatePath("/settings");
      return { ok: true, message: "Sambungan Telegram diputuskan. Semua cadangan dan pautan lama dibatalkan." };
    }
    if (!isTelegramConfigured(process.env)) return { ok: false, message: "Telegram belum dikonfigurasi. Hubungi pemilik aplikasi." };
    if (operation === "confirmLink") {
      if (!await confirmTelegramLink(user.id, form.get("code"))) {
        return { ok: false, message: "Kod tidak sah atau pautan sudah tamat. Jana pautan baharu jika perlu." };
      }
      revalidatePath("/settings");
      return { ok: true, message: "Telegram berjaya disambungkan." };
    }
    const username = telegramBotUsername(process.env);
    if (!username) return { ok: false, message: "Nama bot Telegram belum dikonfigurasi." };
    const link = await createLinkToken(user.id);
    return {
      ok: true, message: "Pautan baharu tersedia selama 10 minit dan hanya boleh digunakan sekali.",
      linkUrl: `https://t.me/${username}?start=${link.token}`, expiresAt: link.expiresAt,
    };
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, message: error.code === "UNAUTHENTICATED" ? "Sesi tidak sah. Sila log masuk semula." : "Akaun ini tidak boleh dipautkan. Semak status sambungan; akaun demo tidak dibenarkan." };
    if (error instanceof z.ZodError) return { ok: false, message: "Permintaan tidak sah. Semak kod atau tindakan anda." };
    // Never serialize database errors, credentials or existing link tokens.
    return { ok: false, message: "Sambungan tidak dapat dikemas kini. Akaun demo tidak boleh dipautkan. Sila cuba lagi." };
  }
}
