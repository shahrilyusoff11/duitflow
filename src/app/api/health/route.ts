import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Public readiness exposes no credentials, hosts, schema, or user records.
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
