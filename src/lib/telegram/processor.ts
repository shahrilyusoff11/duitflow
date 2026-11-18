import "server-only";
import { todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { monthSchema } from "@/lib/finance/validation";
import { approvePendingAction, cancelPendingAction, getActionForUpdate, getPendingAction, getTelegramBudgets, getTelegramCategories, getTelegramReport, redeemLinkToken, replacePendingAction, resolveTelegramUser, TelegramAccessError } from "./dal";
import { clarificationQuestion, continueClarification, parseTelegramText, type ParseResult, type TelegramCategory } from "./parser";
import { answerCallbackQuery, sendMessage } from "./transport";
import { clarificationSchema, proposalSchema } from "./schemas";
import type { TelegramUpdate } from "./update";
import { parseWithAi } from "@/lib/ai/parser";
import { queryTelegramFinance } from "./dal";
import { renderFinanceAnswer } from "@/lib/ai/render";

const linkInstructions = "Log masuk ke DuitFlow dan buka Tetapan > Telegram. Jana pautan, buka chat bot ini dan masukkan kod yang diberi dalam Tetapan. Pautan luput selepas 10 minit.";
const help = "DuitFlow: catat belanja dengan pengesahan.\nContoh: Makan RM12, Gaji RM2500, kopi RM8 lepas tu minyak RM40.\n/balance — pendapatan, belanja dan bersih bulan ini\n/budget — status bajet bulan ini\n/report — ringkasan bulan ini\n/cancel — batal cadangan atau soalan\n/link — cara sambungkan akaun\nBoleh tambah YYYY-MM selepas arahan laporan. Untuk ubah cadangan, batal dan hantar semula.";

type Markup = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
type LinkedUser = NonNullable<Awaited<ReturnType<typeof resolveTelegramUser>>>;

async function reply(chatId: string, text: string, markup?: Markup, linked?: LinkedUser) {
  // Telegram's message limit is 4096 characters. Preserve every proposal value
  // across bounded messages; only the last part carries confirmation buttons.
  const chunks: string[] = [];
  let chunk = "";
  for (const line of text.split("\n")) {
    if (chunk && chunk.length + line.length + 1 > 3900) { chunks.push(chunk); chunk = ""; }
    // Defensive bound even if a future caller introduces one very long line.
    let remainder = line;
    while (remainder.length > 3900) { chunks.push(remainder.slice(0, 3900)); remainder = remainder.slice(3900); }
    chunk += `${chunk ? "\n" : ""}${remainder}`;
  }
  if (chunk) chunks.push(chunk);
  for (const [index, content] of chunks.entries()) {
    if (linked) {
      const current = await resolveTelegramUser(chatId);
      if (!current || current.id !== linked.id || current.connectionId !== linked.connectionId) return;
    }
    await sendMessage(chatId, content, index === chunks.length - 1 ? markup : undefined);
  }
}

async function presentStored(chatId: string, pending: Awaited<ReturnType<typeof replacePendingAction>>, categories: TelegramCategory[], linked: LinkedUser) {
  if (pending.consumedAt || pending.expiresAt <= new Date()) { await reply(chatId, "Cadangan ini sudah diproses atau tamat tempoh. Hantar mesej baharu untuk membuat cadangan lain."); return; }
  if (pending.kind === "CLARIFICATION") {
    const payload = clarificationSchema.safeParse(pending.payload);
    await reply(chatId, payload.success ? clarificationQuestion(payload.data, categories) : "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula.", undefined, linked);
    return;
  }
  const payload = proposalSchema.safeParse(pending.payload);
  if (!payload.success) { await reply(chatId, "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula."); return; }
  const byId = new Map(categories.map((category) => [category.id, category.name]));
  const lines = payload.data.transactions.map((item, index) => `${index + 1}. ${item.description}\n${item.type === "INCOME" ? "Pendapatan" : "Belanja"}: ${formatMyr(item.amount)} · ${byId.get(item.categoryId) ?? "kategori tidak tersedia"} · ${item.occurredOn}`);
  await reply(chatId, `Semak cadangan ini sebelum simpan:\n${lines.join("\n")}\nBelum disimpan. Luput selepas 10 minit. Untuk ubah, batal dan hantar semula.`, { inline_keyboard: [[{ text: "Sahkan", callback_data: `a:${pending.id}` }, { text: "Batal", callback_data: `c:${pending.id}` }]] }, linked);
}

async function present(user: LinkedUser, telegramUserId: string, chatId: string, result: ParseResult, categories: TelegramCategory[], updateId: number) {
  if (result.kind === "UNSUPPORTED") { await reply(chatId, result.message); return; }
  const pending = await replacePendingAction(user.id, telegramUserId, result.kind, result.payload, updateId);
  // The DAL can return an existing action for a replay. Render its persisted
  // values and status, never a newly parsed interpretation of the same update.
  await presentStored(chatId, pending, categories, user);
}

async function processCallback(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback) return;
  let notification = "Cadangan ini sudah diproses atau tamat tempoh.";
  let processingFailed = false;
  try {
    const message = callback.message;
    if (callback.from.is_bot || !message || message.chat.type !== "private" || message.chat.id !== callback.from.id) return;
    const chatId = String(message.chat.id), telegramUserId = String(callback.from.id);
    const user = await resolveTelegramUser(telegramUserId);
    if (!user) { notification = "Sambungkan akaun di Tetapan dahulu."; return; }
    const data = /^([ac]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(callback.data ?? "");
    if (!data) return;
    if (data[1].toLowerCase() === "c") {
      const cancelled = await cancelPendingAction(user.id, telegramUserId, data[2]);
      if (cancelled.count !== 1) return;
      notification = "Cadangan dibatalkan.";
      await reply(chatId, "Cadangan dibatalkan. Hantar semula jika mahu mencatat belanja.");
      return;
    }
    const saved = await approvePendingAction(user.id, telegramUserId, data[2]);
    if (!saved) return;
    notification = "Transaksi disimpan.";
    await reply(chatId, `Disimpan:\n${saved.map((item) => `${item.description}: ${formatMyr(item.amount)} · ${item.categoryName} · ${item.occurredOn}`).join("\n")}`, undefined, user);
  } catch (error) {
    processingFailed = true;
    throw error;
  } finally {
    // Telegram requires this even for invalid, stale, unlinked and group taps.
    // An expired callback's permanent400 must not replace a retryable database
    // or delivery failure and make the webhook incorrectly mark its work DONE.
    try { await answerCallbackQuery(callback.id, notification); }
    catch (error) { if (!processingFailed) throw error; }
  }
}

async function processMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message || message.from.is_bot || message.chat.type !== "private" || message.chat.id !== message.from.id || !message.text?.trim()) return;
  const chatId = String(message.chat.id), telegramUserId = String(message.from.id), text = message.text.trim();
  const command = /^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
  if (command && command[1].toLowerCase() === "start" && command[2]) {
    const token = command[2].trim();
    const result = /^[A-Za-z0-9_-]{32,64}$/.test(token) ? await redeemLinkToken(token, telegramUserId) : "INVALID";
    await reply(chatId, result === "CONFLICT" ? "Pautan atau identiti Telegram ini sudah digunakan. Semak sambungan dalam Tetapan DuitFlow." : result === "INVALID" ? "Pautan tidak sah, sudah digunakan atau tamat tempoh. Jana pautan baharu dalam Tetapan DuitFlow." : `Kod pengesahan DuitFlow: ${result.code}\nMasukkan kod ini dalam Tetapan DuitFlow untuk melengkapkan sambungan. Jangan kongsi kod ini.`);
    return;
  }
  const user = await resolveTelegramUser(telegramUserId);
  if (command && ["start", "help", "link"].includes(command[1].toLowerCase())) {
    if (user && (await getPendingAction(user.id, telegramUserId))?.kind === "CLARIFICATION") await cancelPendingAction(user.id, telegramUserId);
    await reply(chatId, command[1].toLowerCase() === "link" || !user ? linkInstructions : help);
    return;
  }
  if (!user) { await reply(chatId, `Akaun Telegram belum disambungkan. ${linkInstructions}`); return; }
  if (command) {
    const operation = command[1].toLowerCase();
    const pending = await getPendingAction(user.id, telegramUserId);
    if (pending?.kind === "CLARIFICATION" || operation === "cancel") await cancelPendingAction(user.id, telegramUserId);
    if (operation === "cancel") { await reply(chatId, "Cadangan atau soalan dibatalkan."); return; }
    if (!["balance", "budget", "report"].includes(operation)) { await reply(chatId, help); return; }
    const periodResult = monthSchema.safeParse(command[2]?.trim() ?? todayInMalaysia().slice(0, 7));
    if (!periodResult.success) { await reply(chatId, "Bulan tidak sah. Cuba /balance atau /balance 2026-11 (YYYY-MM, tahun 2000–2100)."); return; }
    const period = periodResult.data;
    if (operation === "budget") {
      const budgets = await getTelegramBudgets(user.id, telegramUserId, period);
      await reply(chatId, budgets.length ? `Bajet ${period}:\n${budgets.map((row) => `${row.categoryName}: belanja ${formatMyr(row.spent)} / ${formatMyr(row.limitAmount)}; baki ${formatMyr(row.remaining)}`).join("\n")}` : `Tiada bajet untuk ${period}. Tetapkan bajet di web.`, undefined, user);
    } else {
      const report = await getTelegramReport(user.id, telegramUserId, period);
      const base = `${period}\nPendapatan: ${formatMyr(report.income)}\nBelanja: ${formatMyr(report.expense)}\nBersih direkod (pendapatan − belanja): ${formatMyr(report.net)}`;
      await reply(chatId, operation === "balance" ? base : `${base}\nBelanja mengikut kategori:\n${report.breakdown.map((row) => `${row.categoryName}: ${formatMyr(row.amount)}`).join("\n") || "Tiada belanja."}\nTransaksi terkini:\n${report.recent.map((row) => `${row.occurredOn} · ${row.description}: ${formatMyr(row.amount)} (${row.type === "INCOME" ? "pendapatan" : "belanja"})`).join("\n") || "Tiada transaksi."}`, undefined, user);
    }
    return;
  }
  // Immediate feedback plus a five-second AI deadline preserves HTTP retry
  // semantics. after() is housekeeping only, never the sole owner of this work.
  await reply(chatId, "Sedang memproses…");
  const categories = await getTelegramCategories(user.id, telegramUserId);
  const previousDelivery = await getActionForUpdate(user.id, telegramUserId, update.update_id);
  if (previousDelivery) { await presentStored(chatId, previousDelivery, categories, user); return; }
  const pending = await getPendingAction(user.id, telegramUserId);
  const continuation = pending?.kind === "CLARIFICATION" ? continueClarification(pending.payload, text, categories) : null;
  // Casual approval can never become a new AI proposal or a write.
  const casualApproval = /^(ya|yes|ok|sahkan)$/i.test(text);
  const result = continuation ?? (casualApproval ? parseTelegramText(text, categories) : await parseWithAi(user.id, telegramUserId, text, categories));
  if (result.kind === "QUERY") {
    if (pending?.kind === "CLARIFICATION") await cancelPendingAction(user.id, telegramUserId);
    await reply(chatId, renderFinanceAnswer(await queryTelegramFinance(user.id, telegramUserId, result.query)), undefined, user);
    return;
  }
  if (!continuation && result.kind === "UNSUPPORTED" && pending?.kind === "PROPOSAL" && /^(ya|yes|ok|sahkan)$/i.test(text)) {
    await reply(chatId, "Tekan butang Sahkan pada cadangan tertentu untuk menyimpan. /cancel untuk batal.");
    return;
  }
  await present(user, telegramUserId, chatId, result, categories, update.update_id);
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  try {
    if (update.callback_query) await processCallback(update);
    else await processMessage(update);
  } catch (error) {
    if (!(error instanceof TelegramAccessError)) throw error;
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    const sender = update.message?.from ?? update.callback_query?.from;
    if (chat?.type === "private" && chat.id === sender?.id) await reply(String(chat.id), "Sambungan atau kategori tidak tersedia. Semak Tetapan dan hantar semula cadangan; tiada perubahan baharu disimpan.");
  }
}
