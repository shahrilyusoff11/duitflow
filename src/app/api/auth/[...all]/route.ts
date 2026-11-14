import { getAuth } from "@/lib/auth";
import { authJson, createAuthHttpHandler } from "@/lib/auth/http";
import { readAuthEnvironment } from "@/lib/config/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

async function handle(request: Request) {
  try {
    return await createAuthHttpHandler(getAuth(), getDatabase(), readAuthEnvironment(process.env))(request);
  } catch {
    // Do not log the exception: it may contain provider codes, tokens or URLs.
    return authJson({ error: "AUTH_UNAVAILABLE" }, 503);
  }
}

export const GET = handle;
export const POST = handle;
