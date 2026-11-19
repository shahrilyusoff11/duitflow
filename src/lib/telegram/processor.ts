import "server-only";
import { todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { monthSchema } from "@/lib/finance/validation";
import { approvePendingAction, cancelPendingAction, getActionForUpdate, getPendingAction, getTelegramBills, getTelegramBudgets, getTelegramCategories, getTelegramFinanceTopic, getTelegramReport, queryTelegramFinance, redeemLinkToken, replacePendingAction, resolveTelegramUser, setTelegramFinanceTopic, TelegramAccessError } from "./dal";
import { clarificationQuestion, continueClarification, type TelegramCategory } from "./parser";
import { answerCallbackQuery, sendMessage } from "./transport";
import { billClarificationSchema, billPaymentClarificationSchema, pendingClarificationSchema, pendingProposalSchema, type BillProposal } from "./schemas";
import { billQuestion, continueBillDraft, describeBillProposal, parseBillIntent, prepareBillDraft, readBillNameReply } from "./bills";
import type { TelegramUpdate } from "./update";
import { parseTransactionWithAi } from "@/lib/ai/parser";
import { continueFinanceTopic, parseFinanceFollowup, parseFinanceQuestion } from "@/lib/ai/question";
import { financeTopicQuerySchema } from "@/lib/ai/schemas";
import { renderFinanceAnswer, renderMonthlyReport } from "@/lib/ai/render";

const linkInstructions = "Log masuk ke DuitFlow dan buka Tetapan > Telegram. Jana pautan, buka chat bot ini dan masukkan kod yang diberi dalam Tetapan. Pautan luput selepas 10 minit.";
const help = "Cakap macam biasa dengan saya. Contohnya:\n• Analisis kewangan aku bulan ni\n• Kat mana aku boleh jimat?\n• Trend belanja tiga bulan\n• Boleh spend RM100 untuk makan?\n• Harini aku beli KFC RM20 dan karaoke 30\n• Bagi report perbelanjaan aku bulan ni\n• Bil terdekat apa?\n• Dah bayar bil ShopeePay RM30\n\n/balance — ringkasan bulan ini\n/budget — status bajet\n/report — laporan terperinci\n/bills — bil akan datang dan tertunggak\n/cancel — batal cadangan atau soalan\n/link — sambungkan akaun\nTekan Sahkan untuk menyimpan cadangan.";
const mealSmallTalk = /^(?:(?:kau|awak|anda|bot)\s+)?(?:dah|sudah)\s+makan(?:\s+(?:ke|kah|belum|tak)[.?!？]*|\s*[?？]+)$|^(?:have you eaten|did you eat)(?: yet)?[.?!？]*$/i;

type Markup = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
type LinkedUser = NonNullable<Awaited<ReturnType<typeof resolveTelegramUser>>>;
type Pending = NonNullable<Awaited<ReturnType<typeof replacePendingAction>>>;

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

async function presentStored(chatId: string, pending: Pending, categories: TelegramCategory[], linked: LinkedUser) {
  if (pending.consumedAt || pending.expiresAt <= new Date()) { await reply(chatId, "Cadangan ini sudah diproses atau tamat tempoh. Hantar mesej baharu untuk membuat cadangan lain."); return; }
  if (pending.kind === "CLARIFICATION") {
    const payload = pendingClarificationSchema.safeParse(pending.payload);
    if (!payload.success) {
      await reply(chatId, "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula.", undefined, linked);
      return;
    }
    const question = "operation" in payload.data
      ? payload.data.operation === "pay_bill"
        ? "Bil mana yang dah dibayar? Balas dengan nama dalam senarai bil. /cancel untuk batal."
        : `${billQuestion(payload.data.bill, categories)} /cancel untuk batal.`
      : clarificationQuestion(payload.data, categories);
    await reply(chatId, question, undefined, linked);
    return;
  }
  const payload = pendingProposalSchema.safeParse(pending.payload);
  if (!payload.success) { await reply(chatId, "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula."); return; }
  const byId = new Map(categories.map((category) => [category.id, category.name]));
  const details = "operation" in payload.data ? describeBillProposal(payload.data, categories) : payload.data.transactions.map((item, index) =>
    `${index + 1}. ${item.description}\n${item.type === "INCOME" ? "Pendapatan" : "Belanja"}: ${formatMyr(item.amount)} · ${byId.get(item.categoryId) ?? "kategori tidak tersedia"} · ${item.occurredOn}`).join("\n");
  await reply(chatId, `Semak cadangan ini sebelum simpan:\n${details}\nBelum disimpan. Luput selepas 10 minit. Untuk ubah, batal dan hantar semula.`, { inline_keyboard: [[{ text: "Sahkan", callback_data: `a:${pending.id}` }, { text: "Batal", callback_data: `c:${pending.id}` }]] }, linked);
}

type Proposed = { kind: "PROPOSAL" | "CLARIFICATION"; payload: unknown };
async function present(user: LinkedUser, chatId: string, result: Proposed, categories: TelegramCategory[], updateId: number, clarificationId?: string) {
  const pending = await replacePendingAction(user.id, chatId, result.kind, result.payload, updateId, clarificationId);
  // The DAL can return an existing action for a replay. Render its persisted
  // values and status, never a newly parsed interpretation of the same update.
  if (!pending) { await reply(chatId, "Soalan tadi sudah berubah atau tamat tempoh. Hantar butiran penuh semula."); return; }
  await presentStored(chatId, pending, categories, user);
}

function billList(bills: Awaited<ReturnType<typeof getTelegramBills>>, today: string) {
  if (!bills.length) return "Tiada bil tertunggak atau perlu dibayar dalam 30 hari akan datang.";
  return `Bil tertunggak dan bil dalam 30 hari akan datang:\n${bills.slice(0, 10).map((bill) =>
    `• ${bill.name} · ${formatMyr(bill.amount)} · ${bill.nextDueOn}${bill.nextDueOn < today ? " (tertunggak)" : ""}`).join("\n")}${bills.length > 10 ? "\nBuka DuitFlow untuk semua bil." : ""}`;
}

function describeBillLookup(bills: Awaited<ReturnType<typeof getTelegramBills>>) {
  if (!bills.length) return "Saya tak jumpa bil aktif dengan nama itu. Taip /bills untuk semak senarai atau ‘catat bil’ untuk tambah.";
  if (bills.length > 1) return "Ada beberapa bil aktif dengan nama itu. Buka DuitFlow untuk pilih bil yang betul.";
  const [bill] = bills;
  return `Bil ${bill.name} perlu dibayar ${formatMyr(bill.amount)} pada ${bill.nextDueOn}. Jika sudah bayar, beritahu saya ‘dah bayar bil ${bill.name}’.`;
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
      await reply(chatId, "Cadangan dibatalkan.");
      return;
    }
    const saved = await approvePendingAction(user.id, telegramUserId, data[2]);
    if (!saved) return;
    if (!Array.isArray(saved)) {
      if (saved.kind === "BILL_CHANGED") {
        notification = "Butiran bil sudah berubah.";
        await reply(chatId, "Butiran bil sudah berubah. Semak bil dan hantar permintaan semula.", undefined, user);
      } else {
        notification = saved.kind === "BILL_CREATED" ? "Bil disimpan." : "Bayaran direkod.";
        const content = saved.kind === "BILL_CREATED"
          ? `Bil ${saved.name} disimpan. Perlu dibayar ${formatMyr(saved.amount)} pada ${saved.nextDueOn}.`
          : `Bayaran ${formatMyr(saved.payment.amount)} untuk ${saved.payment.description} direkod pada ${saved.payment.occurredOn}.${saved.nextDueOn ? ` Bil seterusnya pada ${saved.nextDueOn}.` : " Jadual bil sudah tamat."}`;
        await reply(chatId, content, undefined, user);
      }
      return;
    }
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
    if (operation === "cancel") {
      await setTelegramFinanceTopic(user.id, telegramUserId, user.connectionId, update.update_id, null);
      await reply(chatId, "Cadangan atau soalan dibatalkan.");
      return;
    }
    if (operation === "bills") {
      await reply(chatId, billList(await getTelegramBills(user.id, telegramUserId), todayInMalaysia()), undefined, user);
      return;
    }
    if (!["balance", "budget", "report"].includes(operation)) { await reply(chatId, help); return; }
    const periodResult = monthSchema.safeParse(command[2]?.trim() ?? todayInMalaysia().slice(0, 7));
    if (!periodResult.success) { await reply(chatId, "Bulan tidak sah. Cuba /balance atau /balance 2026-11 (YYYY-MM, tahun 2000–2100)."); return; }
    const period = periodResult.data;
    if (operation === "budget") {
      const budgets = await getTelegramBudgets(user.id, telegramUserId, period);
      await reply(chatId, budgets.length ? `Bajet ${period}:\n${budgets.map((row) => `${row.categoryName}: belanja ${formatMyr(row.spent)} / ${formatMyr(row.limitAmount)}; baki ${formatMyr(row.remaining)}`).join("\n")}` : `Tiada bajet untuk ${period}. Tetapkan bajet di web.`, undefined, user);
    } else {
      const report = await getTelegramReport(user.id, telegramUserId, period);
      await reply(chatId, renderMonthlyReport(report, period, operation === "balance" ? "BALANCE" : "FULL"), undefined, user);
    }
    return;
  }
  const greeting = /^(?:hi|hai|helo|hello|hey|salam|assalamualaikum)(?:[,.!]+\s*|\s+|$)/i;
  const greeted = text.replace(greeting, "").trim();
  if (!greeted) {
    await reply(chatId, "Hai! Nak catat apa hari ini? Boleh juga tanya ‘berapa aku spend bulan ni?’ atau ‘ada bil kena bayar tak?’");
    return;
  }
  if (mealSmallTalk.test(greeted)) {
    await reply(chatId, "Kalau bot boleh makan, saya dah pesan nasi lemak 😄");
    return;
  }
  const chatText = greeted.replace(/^(?:(?:boleh(?:\s+tolong)?|tolong|(?:aku|saya)\s+(?:nak|mahu))\s+)?(?:catat(?:kan)?|rekod(?:kan)?|log)\s+/i, "");
  if (/^(?:terima kasih|tq|thanks|thank you)[.!]*$/i.test(chatText)) {
    await reply(chatId, "Sama-sama!");
    return;
  }

  const now = new Date();
  const categories = await getTelegramCategories(user.id, telegramUserId);
  const previousDelivery = await getActionForUpdate(user.id, telegramUserId, update.update_id);
  if (previousDelivery) { await presentStored(chatId, previousDelivery, categories, user); return; }
  const pending = await getPendingAction(user.id, telegramUserId);
  const clarification = pending?.kind === "CLARIFICATION" ? pending : undefined;
  if (/^(?:ya|yes|ok|okay|sahkan)[.!]*$/i.test(chatText)) {
    const response = pending?.kind === "PROPOSAL" ? "Tekan butang Sahkan pada cadangan tertentu untuk menyimpan. /cancel untuk batal." : "Baik. Beritahu saya apa yang nak dicatat atau disemak.";
    if (clarification) await presentStored(chatId, clarification, categories, user);
    else await reply(chatId, response);
    return;
  }
  const directQuestion = parseFinanceQuestion(chatText, categories);
  const followup = directQuestion ? null : parseFinanceFollowup(chatText);
  if (directQuestion || followup) {
    const topic = followup ? await getTelegramFinanceTopic(user.id, telegramUserId, user.connectionId, update.update_id, now) : null;
    const question = directQuestion ?? (topic && followup ? continueFinanceTopic(topic, followup) : null);
    if (!question) {
      await reply(chatId, "Sebut soalan penuh supaya saya tahu apa yang nak disemak. Contohnya ‘Analisis belanja aku bulan lepas’ atau ‘Boleh spend RM50 untuk makan?’");
      return;
    }
    if (clarification) await cancelPendingAction(user.id, telegramUserId, clarification.id);
    const answer = await queryTelegramFinance(user.id, telegramUserId, question, now);
    if ("month" in answer) {
      const remembered = financeTopicQuerySchema.safeParse(answer.kind === "PURCHASE"
        ? { operation: "purchase_check", categoryName: answer.categoryName, period: answer.month }
        : { ...question, period: answer.month });
      if (remembered.success) await setTelegramFinanceTopic(user.id, telegramUserId, user.connectionId, update.update_id, remembered.data, now);
    }
    await reply(chatId, renderFinanceAnswer(answer), undefined, user);
    return;
  }
  const transactionFollowup = clarification ? continueClarification(clarification.payload, chatText, categories) : null;
  if (transactionFollowup && transactionFollowup.kind !== "UNSUPPORTED") {
    await present(user, chatId, transactionFollowup, categories, update.update_id, clarification?.id);
    return;
  }
  const billState = billClarificationSchema.safeParse(clarification?.payload);
  const billFollowup = billState.success ? continueBillDraft(billState.data.bill, chatText, categories, now) : null;
  if (billFollowup) {
    // Resolve a bill name supplied in the follow-up just like an initial name.
    if (!billState.data?.bill.name && billFollowup.name) {
      const matches = await getTelegramBills(user.id, telegramUserId, { name: billFollowup.name }, now);
      if (matches.length) {
        if (clarification) await cancelPendingAction(user.id, telegramUserId, clarification.id);
        await reply(chatId, describeBillLookup(matches), undefined, user);
        return;
      }
    }
    await present(user, chatId, prepareBillDraft(billFollowup, categories), categories, update.update_id, clarification?.id);
    return;
  }
  if (billState.success && /^(?:sekali(?: sahaja| saja| je)?|one[- ]off)[.!]*$/i.test(chatText)) {
    if (clarification) await cancelPendingAction(user.id, telegramUserId, clarification.id);
    await reply(chatId, "Jadual DuitFlow menyokong bil bulanan dan tahunan. Untuk bil sekali sahaja, boleh catat belanja selepas dibayar.");
    return;
  }

  const payState = billPaymentClarificationSchema.safeParse(clarification?.payload);
  const paymentName = payState.success ? readBillNameReply(chatText) : undefined;
  const paymentFollowup = paymentName && payState.success ? { kind: "PAY" as const, name: paymentName, payment: payState.data.payment } : undefined;
  const bill = paymentFollowup ?? parseBillIntent(chatText, now);
  if (bill) {
    if (bill.kind === "MESSAGE") { await reply(chatId, bill.message); return; }
    if (bill.kind === "PAY" && !bill.name) {
      await present(user, chatId, { kind: "CLARIFICATION", payload: { operation: "pay_bill", payment: bill.payment } }, categories, update.update_id);
      return;
    }
    const name = bill.kind === "DRAFT" ? bill.bill.name : "name" in bill ? bill.name : undefined;
    const filter = bill.kind === "NEXT" ? { next: true as const } : name ? { name } : undefined;
    const matches = filter || bill.kind === "LIST" ? await getTelegramBills(user.id, telegramUserId, filter, now) : [];
    if (bill.kind === "DRAFT" && !matches.length) {
      await present(user, chatId, prepareBillDraft(bill.bill, categories), categories, update.update_id);
    } else if (bill.kind === "PAY" && matches.length === 1) {
      const [match] = matches;
      const payload: BillProposal = {
        operation: "pay_bill", billId: match.id, version: match.version, name: match.name, nextDueOn: match.nextDueOn,
        payment: { amount: bill.payment.amount ?? match.amount, occurredOn: bill.payment.occurredOn, description: match.name },
      };
      await present(user, chatId, { kind: "PROPOSAL", payload }, categories, update.update_id, paymentFollowup ? clarification?.id : undefined);
    } else {
      if (clarification && !paymentFollowup) await cancelPendingAction(user.id, telegramUserId, clarification.id);
      const response = bill.kind === "LIST" ? billList(matches, todayInMalaysia(now))
        : bill.kind === "NEXT" ? (matches.length ? `Bil terdekat\n${describeBillLookup(matches)}` : "Tiada bil berjadual mulai hari ini. Taip /bills untuk semak bil tertunggak.")
        : describeBillLookup(matches);
      await reply(chatId, response, undefined, user);
    }
    return;
  }

  // Finish within the webhook lease so a failed delivery remains retryable.
  await reply(chatId, "Sedang memproses…");
  const result = await parseTransactionWithAi(user.id, telegramUserId, chatText, categories, now);
  if (result.kind === "UNSUPPORTED") {
    if (clarification) await presentStored(chatId, clarification, categories, user);
    else await reply(chatId, result.message);
    return;
  }
  await present(user, chatId, result, categories, update.update_id);
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
