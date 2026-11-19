import { createHash, timingSafeEqual } from "node:crypto";
import { isTelegramConfigured } from "@/lib/config/telegram";
import { runTelegramNotifications } from "@/lib/telegram/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 503, headers });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return new Response(null, { status: 401, headers });
  }
  if (!isTelegramConfigured(process.env)) return new Response(null, { status: 503, headers });
  try {
    const results = await runTelegramNotifications();
    return Response.json(results, { status: results.truncated || results.failed ? 503 : 200, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
