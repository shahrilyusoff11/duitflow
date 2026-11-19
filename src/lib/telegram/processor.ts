import "server-only";
import { todayInMalaysia } from "@/lib/finance/dates";
import { formatMyr } from "@/lib/finance/money";
import { monthSchema } from "@/lib/finance/validation";
import { approvePendingAction, cancelPendingAction, getActionForUpdate, getPendingAction, getTelegramBills, getTelegramBudgets, getTelegramCategories, getTelegramFinanceTopic, getTelegramReport, queryTelegramFinance, redeemLinkToken, replacePendingAction, resolveTelegramUser, setTelegramFinanceTopic, TelegramAccessError } from "./dal";
import { clarificationQuestion, continueClarification, parseTelegramText, type TelegramCategory } from "./parser";
import { answerCallbackQuery, sendMessage } from "./transport";
import { billClarificationSchema, billPaymentClarificationSchema, pendingClarificationSchema, pendingProposalSchema, transactionSelectionSchema, type BillProposal, type FinanceMutation, type RecordContext } from "./schemas";
import { billQuestion, continueBillDraft, describeBillProposal, parseBillIntent, prepareBillDraft, readBillNameReply, type BillIntent } from "./bills";
import type { TelegramUpdate } from "./update";
import { interpretTelegramWithAi } from "@/lib/ai/parser";
import { continueFinanceTopic, parseFinanceFollowup, parseFinanceQuestion, type FinanceFollowup } from "@/lib/ai/question";
import { financeTopicQuerySchema, type FinanceQuery } from "@/lib/ai/schemas";
import { renderFinanceAnswer, renderMonthlyReport } from "@/lib/ai/render";
import { describeFinanceMutation, describeNotifications, notificationChange, notificationHelp, parseBudgetChange, parseLedgerChange, recordReference } from "./finance-tools";
import { findLedgerRecords, getNotificationSettings, proposeBudget, proposeLedgerChange, readRecordContext, rememberRecords } from "./records";
import { asksWhySpendingChanged, explainSpendingChange } from "./spending-change";

const linkInstructions = "Log masuk ke DuitFlow dan buka Tetapan > Telegram. Jana pautan, buka chat bot ini dan masukkan kod yang diberi dalam Tetapan. Pautan luput selepas 10 minit.";
const help = "Cakap macam biasa dengan saya. Contohnya:\n• Harini aku beli KFC RM20 dan karaoke 30\n• Tukar KFC tadi kepada RM25\n• Undo catatan terakhir\n• Bajet makan bulan depan RM400\n• Kenapa belanja aku naik?\n• Analisis kewangan aku bulan ni\n• Boleh spend RM100 untuk makan?\n• Bil tiket RM70 sekali bayar esok\n• Ansuran laptop RM100 6 kali bayar bermula esok\n• Dah bayar bil yang tadi\n\n/balance — ringkasan bulan ini\n/budget — status bajet\n/report — laporan terperinci\n/bills — bil akan datang dan tertunggak\n/peringatan · /mingguan — tetapan penghantaran\n/cancel — batal cadangan atau soalan\n/link — sambungkan akaun\nTekan Sahkan untuk menyimpan cadangan.";
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
      if (!current || current.id !== linked.id || current.connectionId !== linked.connectionId) return false;
    }
    await sendMessage(chatId, content, index === chunks.length - 1 ? markup : undefined);
  }
  return true;
}

async function replyWithRecords(chatId: string, text: string, linked: LinkedUser, updateId: number, kind: RecordContext["kind"], ids: string[], relatedBillId?: string) {
  if (await reply(chatId, text, undefined, linked)) {
    await rememberRecords(linked.id, chatId, linked.connectionId, updateId, ids.length ? { kind, ids, ...(relatedBillId ? { relatedBillId } : {}) } : null);
  }
}

function choiceLines<T extends { id: string }>(ids: string[], rows: T[], render: (row: T) => string) {
  return ids.map((id, index) => {
    const row = rows.find((item) => item.id === id);
    return `${index + 1}. ${row ? render(row) : "Rekod sudah tiada"}`;
  }).join("\n");
}

function ledgerLine(row: { description: string; amount: string; categoryName: string; occurredOn: string }) {
  return `${row.description} · ${formatMyr(row.amount)} · ${row.categoryName} · ${row.occurredOn}`;
}

async function presentStored(chatId: string, pending: Pending, categories: TelegramCategory[], linked: LinkedUser) {
  if (pending.consumedAt || pending.expiresAt <= new Date()) { await reply(chatId, "Cadangan ini sudah diproses atau tamat tempoh. Hantar mesej baharu untuk membuat cadangan lain."); return; }
  if (pending.kind === "CLARIFICATION") {
    const payload = pendingClarificationSchema.safeParse(pending.payload);
    if (!payload.success) {
      await reply(chatId, "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula.", undefined, linked);
      return;
    }
    let question: string;
    if (!("operation" in payload.data)) question = clarificationQuestion(payload.data, categories);
    else if (payload.data.operation === "create_bill") question = `${billQuestion(payload.data.bill, categories)} /cancel untuk batal.`;
    else if (payload.data.operation === "choose_transaction") {
      const ids = payload.data.choices;
      const rows = await findLedgerRecords(linked.id, chatId, { ids });
      question = `Transaksi mana? Balas dengan nombor dalam senarai. /cancel untuk batal.\n${choiceLines(ids, rows, ledgerLine)}`;
    } else {
      const ids = payload.data.choices;
      const bills = ids ? await getTelegramBills(linked.id, chatId, { ids }) : [];
      question = "Bil mana yang dah dibayar? Balas dengan nama atau nombor dalam senarai bil. /cancel untuk batal.";
      if (ids) question += `\n${choiceLines(ids, bills, (bill) => `${bill.name} · ${formatMyr(bill.amount)} · ${bill.nextDueOn}`)}`;
    }
    await reply(chatId, question, undefined, linked);
    return;
  }
  const payload = pendingProposalSchema.safeParse(pending.payload);
  if (!payload.success) { await reply(chatId, "Cadangan tidak tersedia. Gunakan /cancel dan hantar semula."); return; }
  const byId = new Map(categories.map((category) => [category.id, category.name]));
  const details = "operation" in payload.data
    ? payload.data.operation === "create_bill" || payload.data.operation === "pay_bill" ? describeBillProposal(payload.data, categories) : describeFinanceMutation(payload.data)
    : payload.data.transactions.map((item, index) =>
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
  return `Bil tertunggak dan bil dalam 30 hari akan datang:\n${bills.slice(0, 10).map((bill, index) =>
    `${index + 1}. ${bill.name} · ${formatMyr(bill.amount)} · ${bill.nextDueOn}${bill.nextDueOn < today ? " (tertunggak)" : ""}${bill.progress ? ` · ${bill.progress}` : ""}`).join("\n")}${bills.length > 10 ? "\nBuka DuitFlow untuk semua bil." : ""}`;
}

function describeBillLookup(bills: Awaited<ReturnType<typeof getTelegramBills>>) {
  if (!bills.length) return "Saya tak jumpa bil aktif dengan nama itu. Taip /bills untuk semak senarai atau ‘catat bil’ untuk tambah.";
  if (bills.length > 1) return `Ada beberapa padanan. Balas dengan nombor bil.\n${choiceLines(bills.slice(0, 10).map((bill) => bill.id), bills,
    (bill) => `${bill.name} · ${formatMyr(bill.amount)} · ${bill.nextDueOn}${bill.completed ? " (selesai)" : ""}`)}`;
  const [bill] = bills;
  if (bill.completed) return `Bil ${bill.name} sudah selesai. Tarikh bil terakhir ${bill.nextDueOn}.${bill.progress ? ` ${bill.progress}.` : ""}`;
  return `Bil ${bill.name} perlu dibayar ${formatMyr(bill.amount)} pada ${bill.nextDueOn}.${bill.progress ? ` ${bill.progress}.` : ""} Jika sudah bayar, beritahu saya ‘dah bayar bil ${bill.name}’.`;
}

function referenceIds(context: RecordContext | null, kind: RecordContext["kind"]) {
  if (context?.kind === kind) return context.ids;
  return kind === "bill" && context?.relatedBillId ? [context.relatedBillId] : [];
}

function chosenId(ids: string[], reference: NonNullable<ReturnType<typeof recordReference>>) {
  return reference.index === null ? ids.length === 1 ? ids[0] : undefined : ids[reference.index];
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
      switch (saved.kind) {
        case "BILL_CHANGED":
          notification = "Butiran bil sudah berubah.";
          await reply(chatId, "Butiran bil sudah berubah. Semak bil dan hantar permintaan semula.", undefined, user);
          break;
        case "RECORD_CHANGED":
          notification = "Butiran sudah berubah.";
          await reply(chatId, "Butiran sudah berubah sejak cadangan ditunjukkan. Semak rekod dan hantar permintaan semula.", undefined, user);
          break;
        case "BILL_CREATED":
          notification = "Bil disimpan.";
          await replyWithRecords(chatId, `Bil ${saved.name} disimpan. Perlu dibayar ${formatMyr(saved.amount)} pada ${saved.nextDueOn}.`, user, update.update_id, "bill", [saved.id]);
          break;
        case "BILL_PAID":
          notification = "Bayaran direkod.";
          await replyWithRecords(chatId, `Bayaran ${formatMyr(saved.payment.amount)} untuk ${saved.payment.description} direkod pada ${saved.payment.occurredOn}.${saved.nextDueOn ? ` Bil seterusnya pada ${saved.nextDueOn}.` : " Jadual bil sudah tamat."}`,
            user, update.update_id, "transaction", [saved.payment.id], saved.billId);
          break;
        case "TRANSACTION_EDITED":
          notification = "Transaksi dikemas kini.";
          await replyWithRecords(chatId, `Amaun ${saved.description} dikemas kini kepada ${formatMyr(saved.amount)}.`, user, update.update_id, "transaction", [saved.id]);
          break;
        case "TRANSACTION_UNDONE":
          notification = "Transaksi dipadam.";
          await replyWithRecords(chatId, `Transaksi ${saved.description} dipadam.${saved.restore ? ` Bil ${saved.restore.name} dibuka semula untuk ${saved.restore.dueOn}.` : ""}`,
            user, update.update_id, "transaction", []);
          break;
        case "BUDGET_SAVED":
          notification = "Bajet disimpan.";
          await reply(chatId, `Bajet ${saved.label} untuk ${saved.period} disimpan dengan had ${formatMyr(saved.amount)}.`, undefined, user);
          break;
        case "NOTIFICATIONS_SAVED":
          notification = "Tetapan disimpan.";
          await reply(chatId, `Tetapan disimpan.\n${describeNotifications(saved.settings)}`, undefined, user);
          break;
      }
      return;
    }
    notification = "Transaksi disimpan.";
    await replyWithRecords(chatId, `Disimpan:\n${saved.map((item, index) => `${index + 1}. ${item.description}: ${formatMyr(item.amount)} · ${item.categoryName} · ${item.occurredOn}`).join("\n")}`,
      user, update.update_id, "transaction", saved.map((item) => item.id));
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
    if (operation === "peringatan" || operation === "mingguan") {
      const previous = await getActionForUpdate(user.id, telegramUserId, update.update_id);
      if (previous) { await presentStored(chatId, previous, [], user); return; }
      const setting = await getNotificationSettings(user.id, telegramUserId);
      const change = notificationChange(operation, command[2] ?? "");
      if (!change) { await reply(chatId, `${describeNotifications(setting.settings)}\n\n${notificationHelp}`, undefined, user); return; }
      const next = { ...setting.settings, ...change };
      if (Object.entries(next).every(([key, value]) => setting.settings[key as keyof typeof next] === value)) {
        await reply(chatId, `Tetapan semasa\n${describeNotifications(next)}`, undefined, user);
        return;
      }
      await present(user, chatId, { kind: "PROPOSAL", payload: { operation: "set_notifications", version: setting.version, previous: setting.settings, next } }, [], update.update_id);
      return;
    }
    const pending = await getPendingAction(user.id, telegramUserId);
    if (pending?.kind === "CLARIFICATION" || operation === "cancel") await cancelPendingAction(user.id, telegramUserId);
    if (operation === "cancel") {
      await setTelegramFinanceTopic(user.id, telegramUserId, user.connectionId, update.update_id, null);
      await rememberRecords(user.id, telegramUserId, user.connectionId, update.update_id, null);
      await reply(chatId, "Cadangan atau soalan dibatalkan.");
      return;
    }
    if (operation === "bills") {
      const bills = await getTelegramBills(user.id, telegramUserId);
      await replyWithRecords(chatId, billList(bills, todayInMalaysia()), user, update.update_id, "bill", bills.slice(0, 10).map((bill) => bill.id));
      return;
    }
    if (!["balance", "budget", "report"].includes(operation)) { await reply(chatId, help); return; }
    const periodResult = monthSchema.safeParse(command[2]?.trim() ?? todayInMalaysia().slice(0, 7));
    if (!periodResult.success) { await reply(chatId, "Bulan tidak sah. Cuba /balance atau /balance 2026-11 (YYYY-MM, tahun 2000–2100)."); return; }
    const period = periodResult.data;
    if (operation === "budget") {
      const budgets = await getTelegramBudgets(user.id, telegramUserId, period);
      await reply(chatId, budgets.length ? `Bajet ${period}:\n${budgets.map((row) => `${row.categoryName}: belanja ${formatMyr(row.spent)} / ${formatMyr(row.limitAmount)}; baki ${formatMyr(row.remaining)}`).join("\n")}` : `Tiada bajet untuk ${period}. Cuba ‘Bajet makan ${period} RM400’.`, undefined, user);
    } else {
      const report = await getTelegramReport(user.id, telegramUserId, period);
      const content = renderMonthlyReport(report, period, operation === "balance" ? "BALANCE" : "FULL");
      if (operation === "report") await replyWithRecords(chatId, content, user, update.update_id, "transaction", report.recent.map((row) => row.id));
      else await reply(chatId, content, undefined, user);
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
  const updateId = update.update_id;
  const contextForChat = () => readRecordContext(user.id, telegramUserId, user.connectionId, updateId, now);
  const showBills = (bills: Awaited<ReturnType<typeof getTelegramBills>>, content = describeBillLookup(bills)) =>
    replyWithRecords(chatId, content, user, updateId, "bill", bills.slice(0, 10).map((bill) => bill.id));
  const ledgerSelection = transactionSelectionSchema.safeParse(clarification?.payload);
  const payState = billPaymentClarificationSchema.safeParse(clarification?.payload);
  const reference = recordReference(chatText);
  const budget = parseBudgetChange(chatText, categories, now);
  if (budget) {
    if ("error" in budget) await reply(chatId, budget.error!, undefined, user);
    else await present(user, chatId, { kind: "PROPOSAL", payload: await proposeBudget(user.id, telegramUserId, budget.category.id, budget.month, budget.amount) }, categories, updateId);
    return;
  }
  const ledgerChange = parseLedgerChange(chatText);
  const proposeTransaction = async (id: string, change: Extract<FinanceMutation, { operation: "change_transaction" }>["change"], clarificationId?: string) => {
    const proposal = await proposeLedgerChange(user.id, telegramUserId, id, change);
    if ("error" in proposal) await reply(chatId, proposal.error!, undefined, user);
    else await present(user, chatId, { kind: "PROPOSAL", payload: proposal }, categories, updateId, clarificationId);
  };
  if (ledgerChange) {
    if ("error" in ledgerChange) { await reply(chatId, ledgerChange.error!, undefined, user); return; }
    const target = ledgerChange.reference;
    const contextIds = target && target.kind !== "bill" ? referenceIds(await contextForChat(), "transaction") : [];
    const matches = target
      ? await findLedgerRecords(user.id, telegramUserId, { ids: contextIds })
      : await findLedgerRecords(user.id, telegramUserId, ledgerChange.last ? { last: true }
        : { name: ledgerChange.name, occurredOn: ledgerChange.today ? todayInMalaysia(now) : undefined });
    const ids = matches.map((row) => row.id);
    if (target && target.index !== null) {
      // Resolve against the original numbered list, even if a row disappeared.
      const chosen = chosenId(contextIds, target);
      if (chosen && ids.includes(chosen)) await proposeTransaction(chosen, ledgerChange.change);
      else await reply(chatId, "Nombor transaksi itu tidak tersedia. Gunakan /report atau sebut nama transaksi.", undefined, user);
    } else if (matches.length === 1 && (!target || contextIds.length === 1)) {
      await proposeTransaction(matches[0].id, ledgerChange.change);
    } else if (matches.length) {
      await present(user, chatId, { kind: "CLARIFICATION", payload: { operation: "choose_transaction", change: ledgerChange.change, choices: ids.slice(0, 10) } }, categories, updateId);
    } else {
      await reply(chatId, "Saya tak jumpa transaksi anda yang sepadan. Gunakan /report untuk pilih rekod atau sebut nama transaksi.", undefined, user);
    }
    return;
  }
  if (ledgerSelection.success && reference && reference.kind !== "bill") {
    const id = chosenId(ledgerSelection.data.choices, reference);
    if (id) await proposeTransaction(id, ledgerSelection.data.change, clarification?.id);
    else await presentStored(chatId, clarification!, categories, user);
    return;
  }
  const explainSpending = async () => {
    if (clarification) await cancelPendingAction(user.id, telegramUserId, clarification.id);
    const answer = await explainSpendingChange(user.id, telegramUserId, now);
    await replyWithRecords(chatId, answer.text, user, updateId, "transaction", answer.ids);
  };
  if (asksWhySpendingChanged(chatText)) {
    await explainSpending();
    return;
  }
  const answerFinance = async (directQuestion: FinanceQuery | null, followup: FinanceFollowup | null) => {
    const topic = followup ? await getTelegramFinanceTopic(user.id, telegramUserId, user.connectionId, update.update_id, now) : null;
    const question = directQuestion ?? (topic && followup ? continueFinanceTopic(topic, followup) : null);
    if (!question) {
      await reply(chatId, "Sebut soalan penuh supaya saya tahu apa yang nak disemak. Nak semak belanja, bajet atau laporan?");
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
    const content = renderFinanceAnswer(answer);
    if (answer.kind === "RECENT" || (answer.kind === "REPORT" && answer.view === "FULL")) {
      const records = answer.kind === "RECENT" ? answer.rows : answer.report.recent;
      await replyWithRecords(chatId, content, user, updateId, "transaction", records.map((row) => row.id));
    } else await reply(chatId, content, undefined, user);
  };
  const directQuestion = parseFinanceQuestion(chatText, categories);
  const followup = directQuestion ? null : parseFinanceFollowup(chatText);
  if (directQuestion || followup) {
    await answerFinance(directQuestion, followup);
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
        await showBills(matches);
        return;
      }
    }
    await present(user, chatId, prepareBillDraft(billFollowup, categories), categories, update.update_id, clarification?.id);
    return;
  }
  const paymentName = payState.success ? readBillNameReply(chatText) : undefined;
  const paymentFollowup = payState.success && (paymentName || (reference && reference.kind !== "transaction"))
    ? { kind: "PAY" as const, name: paymentName ?? chatText, payment: payState.data.payment } : undefined;
  if (reference && !paymentFollowup) {
    const context = await contextForChat();
    const kind = reference.kind ?? context?.kind;
    const ids = kind ? referenceIds(context, kind) : [];
    const id = chosenId(ids, reference);
    if (kind === "bill" && ids.length) {
      if (reference.index !== null && !id) { await reply(chatId, "Pilih nombor bil dalam senarai.", undefined, user); return; }
      const bills = await getTelegramBills(user.id, telegramUserId, { ids: id ? [id] : ids }, now);
      if (id) await showBills(bills);
      else await reply(chatId, `Bil mana? Balas dengan nombor.\n${choiceLines(ids, bills, (row) => `${row.name} · ${formatMyr(row.amount)} · ${row.nextDueOn}`)}`, undefined, user);
    } else if (kind === "transaction" && ids.length) {
      const rows = await findLedgerRecords(user.id, telegramUserId, { ids: id ? [id] : ids });
      if (id && rows.length) await replyWithRecords(chatId, ledgerLine(rows[0]), user, updateId, kind, [id]);
      else await reply(chatId, `Pilih nombor transaksi yang masih tersedia.\n${choiceLines(ids, rows, ledgerLine)}`, undefined, user);
    } else await reply(chatId, "Saya perlukan rekod yang dimaksudkan. Gunakan /bills atau /report dan pilih nombor daripada senarai.", undefined, user);
    return;
  }
  const handleBill = async (bill: BillIntent, continuingPayment = false, fromAi = false) => {
    const presentBill = (result: Proposed) => fromAi ? presentAi(result)
      : present(user, chatId, result, categories, updateId, continuingPayment ? clarification?.id : undefined);
    if (bill.kind === "MESSAGE") { await reply(chatId, bill.message); return; }
    if (bill.kind === "PAY") {
      const target = bill.name ? recordReference(bill.name) : null;
      const ids = target && target.kind !== "transaction"
        ? (continuingPayment && payState.success ? payState.data.choices : undefined) ?? referenceIds(await contextForChat(), "bill")
        : [];
      const chosen = target ? chosenId(ids, target) : undefined;
      if (target?.index != null && !chosen && continuingPayment) {
        await presentStored(chatId, clarification!, categories, user);
        return;
      }
      const filter = target ? { ids: chosen ? [chosen] : ids }
        : bill.name ? { name: bill.name } : { all: true as const };
      const matches = (await getTelegramBills(user.id, telegramUserId, filter, now)).filter((match) => match.active);
      if (matches.length === 1 && (chosen || (!target && bill.name))) {
        const [match] = matches;
        const payload: BillProposal = {
          operation: "pay_bill", billId: match.id, version: match.version, name: match.name, nextDueOn: match.nextDueOn,
          scheduleAfter: match.scheduleAfter,
          payment: { amount: bill.payment.amount ?? match.amount, occurredOn: bill.payment.occurredOn, description: match.name },
        };
        await presentBill({ kind: "PROPOSAL", payload });
      } else if ((!target && bill.name) || chosen) {
        if (matches.length > 1) {
          await presentBill({ kind: "CLARIFICATION", payload: { operation: "pay_bill", payment: bill.payment, choices: matches.slice(0, 10).map((item) => item.id) } });
        } else await reply(chatId, describeBillLookup([]), undefined, user);
      } else {
        const choices = matches.length ? matches : await getTelegramBills(user.id, telegramUserId, { all: true }, now);
        await presentBill({ kind: "CLARIFICATION", payload: { operation: "pay_bill", payment: bill.payment, ...(choices.length ? { choices: choices.slice(0, 10).map((item) => item.id) } : {}) } });
      }
      return;
    }
    const name = bill.kind === "DRAFT" ? bill.bill.name : bill.kind === "LOOKUP" ? bill.name : undefined;
    const target = name ? recordReference(name) : null;
    if (target) {
      const ids = target.kind === "transaction" ? [] : referenceIds(await contextForChat(), "bill");
      const id = chosenId(ids, target);
      if (target.index !== null && !id) { await reply(chatId, "Pilih nombor daripada senarai /bills.", undefined, user); return; }
      await showBills(await getTelegramBills(user.id, telegramUserId, { ids: id ? [id] : ids }, now));
      return;
    }
    const filter = bill.kind === "NEXT" ? { next: true as const, installmentsOnly: bill.installmentsOnly } : name ? { name, includeCompleted: bill.kind === "LOOKUP" } : undefined;
    const matches = filter || bill.kind === "LIST" ? await getTelegramBills(user.id, telegramUserId, filter, now) : [];
    if (bill.kind === "DRAFT" && !matches.length) {
      await present(user, chatId, prepareBillDraft(bill.bill, categories), categories, update.update_id);
    } else {
      if (clarification) await cancelPendingAction(user.id, telegramUserId, clarification.id);
      const response = bill.kind === "LIST" ? billList(matches, todayInMalaysia(now))
        : bill.kind === "NEXT" ? (matches.length ? `${bill.installmentsOnly ? "Ansuran seterusnya" : "Bil terdekat"}\n${describeBillLookup(matches)}` : "Tiada jadual sepadan mulai hari ini. Taip /bills untuk semak bil tertunggak.")
        : describeBillLookup(matches);
      await showBills(matches, response);
    }
  };
  const presentAi = async (result: Proposed) => {
    const stored = await replacePendingAction(user.id, telegramUserId, result.kind, result.payload, updateId, undefined,
      { connectionId: user.connectionId, pendingId: pending?.id ?? null });
    if (stored) await presentStored(chatId, stored, categories, user);
  };
  const bill = paymentFollowup ?? parseBillIntent(chatText, now);
  if (bill) {
    await handleBill(bill, Boolean(paymentFollowup));
    return;
  }

  const local = parseTelegramText(chatText, categories, now);
  // Finish within the webhook lease so a failed delivery remains retryable.
  let dispatched = false;
  const intent = await interpretTelegramWithAi(user.id, telegramUserId, user.connectionId, chatText, categories, local, now,
    () => {
      dispatched = true;
      return reply(chatId, "Sedang memproses…", undefined, user);
    });
  switch (intent?.kind) {
    case "FINANCE": await answerFinance(intent.query, null); return;
    case "FOLLOWUP": await answerFinance(null, intent.followup); return;
    case "SPENDING_CHANGE": await explainSpending(); return;
    case "BILL": await handleBill(intent.bill, false, true); return;
    case "CLARIFY":
      if (clarification) await presentStored(chatId, clarification, categories, user);
      else await reply(chatId, "Nak semak belanja, semak bil, atau catat sesuatu? Beritahu satu perkara dulu.", undefined, user);
      return;
    case "TRANSACTIONS":
      if (intent.result.kind !== "UNSUPPORTED") { await presentAi(intent.result); return; }
      break;
  }
  if (local.kind === "UNSUPPORTED") {
    if (clarification) await presentStored(chatId, clarification, categories, user);
    else await reply(chatId, local.message);
    return;
  }
  if (dispatched) await presentAi(local);
  else await present(user, chatId, local, categories, update.update_id);
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
