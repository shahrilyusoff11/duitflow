import { z } from "zod";
import { toNextJsHandler } from "better-auth/next-js";
import type { DuitFlowAuth } from "./create-auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuthEnvironment } from "@/lib/config/auth";
import { authRateLimitKey, consumeAuthAttempt } from "./rate-limit";

const signInInput = z.object({
  provider: z.literal("github"),
  callbackURL: z.literal("/dashboard"),
  errorCallbackURL: z.literal("/sign-in?error=oauth").optional(),
}).strict();

export function authJson(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie", ...extraHeaders } });
}

async function limitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createAuthHttpHandler(auth: DuitFlowAuth, database: PrismaClient, environment: AuthEnvironment) {
  const handlers = toNextJsHandler(auth);
  return async function handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    const allowed = request.method === "GET"
      ? ["/ok", "/get-session", "/callback/github", "/error"].includes(path)
      : request.method === "POST" && ["/sign-in/social", "/sign-out"].includes(path);
    if (!allowed) return authJson({ error: "NOT_FOUND" }, 404);
    if (request.method === "POST" && request.headers.get("origin") !== environment.BETTER_AUTH_URL) {
      return authJson({ error: "INVALID_ORIGIN" }, 403);
    }

    let forwarded = request;
    if (path === "/sign-in/social" || path === "/callback/github") {
      const key = authRateLimitKey(request.headers, environment.BETTER_AUTH_SECRET, process.env.VERCEL === "1");
      const bucket = path === "/sign-in/social" ? "oauth-start" : "oauth-callback";
      const allowedAttempt = await consumeAuthAttempt(database, key, bucket, bucket === "oauth-start" ? 10 : 30);
      if (!allowedAttempt) return authJson({ error: "TOO_MANY_REQUESTS" }, 429, { "Retry-After": "60" });
    }

    if (request.method === "POST") {
      const text = await limitedBody(request);
      if (text === null) return authJson({ error: "BODY_TOO_LARGE" }, 413);
      if (path === "/sign-in/social") {
        let input: unknown;
        try { input = JSON.parse(text); } catch { return authJson({ error: "INVALID_INPUT" }, 400); }
        const result = signInInput.safeParse(input);
        if (!result.success) return authJson({ error: "INVALID_INPUT" }, 400);
        forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(result.data) });
      } else {
        const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
        if (!session) return authJson({ error: "UNAUTHENTICATED" }, 401);
        forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: "{}" });
      }
    }
    const response = await (request.method === "GET" ? handlers.GET(forwarded) : handlers.POST(forwarded));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  };
}
