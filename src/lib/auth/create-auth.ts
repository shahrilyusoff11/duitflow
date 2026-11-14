import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuthEnvironment } from "@/lib/config/auth";

export function createAuth(database: PrismaClient, environment: AuthEnvironment) {
  return betterAuth({
    appName: "DuitFlow",
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.BETTER_AUTH_URL],
    database: prismaAdapter(database, { provider: "postgresql", transaction: true }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: environment.GITHUB_CLIENT_ID,
        clientSecret: environment.GITHUB_CLIENT_SECRET,
        scope: ["read:user", "user:email"],
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false,
    },
    advanced: {
      cookiePrefix: "duitflow",
      ipAddress: { disableIpTracking: true },
    },
    // Shared Postgres limiter is applied in the route before OAuth initiation.
    // Do not silently fall back to a process-local limiter on serverless.
    rateLimit: { enabled: false },
    logger: { disabled: true },
    telemetry: { enabled: false },
    onAPIError: { errorURL: `${environment.BETTER_AUTH_URL}/sign-in?error=oauth` },
    plugins: [nextCookies()],
  });
}

export type DuitFlowAuth = ReturnType<typeof createAuth>;
