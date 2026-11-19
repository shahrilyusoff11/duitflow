// Manual only. These messages are synthetic, and no database is opened.
import { interpretChat } from "../src/lib/ai/chat";
import { genericCategoryNames, prepareAiInput } from "../src/lib/ai/input";
import { deepseekProvider } from "../src/lib/ai/provider";
import { AI_TIMEOUT_MS, getAiConfig } from "../src/lib/config/ai";

const config = getAiConfig(process.env);
if (!config) {
  console.log("Skipped: DeepSeek Flash is not configured.");
  process.exit(0);
}

const cases = [
  { name: "Casual Malay", text: "Duit aku bocor kat mana bulan ni?", expected: "top_categories" },
  { name: "Mixed Malay and English", text: "Kategori apa paling banyak aku spend?", expected: "top_categories" },
  { name: "English", text: "Which outgoings took the biggest chunk of my money last month?", expected: "top_categories" },
  { name: "Month follow-up", text: "Kalau untuk bulan yang lepas pulak?", expected: "last_month" },
  { name: "Contextual payment", text: "I've already settled that installment.", expected: "bill_context_proposal" },
];
const provider = deepseekProvider(config.DEEPSEEK_API_KEY);
const now = new Date("2026-11-19T04:00:00Z");
for (const { name, text, expected } of cases) {
  const start = performance.now();
  try {
    const input = prepareAiInput(text);
    if (!input) throw new Error();
    const response = await provider.parse({ message: input.message, categoryNames: genericCategoryNames }, AbortSignal.timeout(AI_TIMEOUT_MS));
    const interpreted = interpretChat(response, input, text, [], now);
    const actual = interpreted?.kind === "FINANCE" ? interpreted.query.operation
      : interpreted?.kind === "FOLLOWUP" && interpreted.followup.kind === "PERIOD" ? interpreted.followup.period
      : interpreted?.kind === "BILL" && interpreted.bill.kind === "PAY" && interpreted.bill.name === "bil yang tadi"
        ? "bill_context_proposal" : interpreted?.kind ?? "unsupported";
    console.log(name, actual === expected ? "PASS" : "FAIL", actual, Math.round(performance.now() - start) + "ms");
    if (actual !== expected) process.exitCode = 1;
  } catch {
    console.log(name, "FAIL provider or validation", Math.round(performance.now() - start) + "ms");
    process.exitCode = 1;
  }
}
