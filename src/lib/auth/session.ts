import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookie } from "better-auth/cookies";
import { getAuth } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/config/auth";

export class AccessError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
  }
}

export async function userFromHeaders(requestHeaders: Headers) {
  // This only skips unnecessary work for an absent cookie; presence never
  // authorizes a request. The library verifies signature, DB row and expiry.
  if (!getSessionCookie(requestHeaders, { cookiePrefix: "duitflow" }) || !isAuthConfigured(process.env)) return null;
  const result = await getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  if (!result) return null;
  return { id: result.user.id, name: result.user.name, email: result.user.email };
}

export async function requireUser(userId?: string) {
  const user = await userFromHeaders(await headers());
  if (!user) throw new AccessError("UNAUTHENTICATED");
  if (userId !== undefined && user.id !== userId) throw new AccessError("FORBIDDEN");
  return user;
}

export async function requirePageUser() {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AccessError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    throw error;
  }
}
