import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { fixtureSessionCookie } from "../helpers/session-cookie";
import { createAuth, type DuitFlowAuth } from "../../src/lib/auth/create-auth";
import { createAuthHttpHandler } from "../../src/lib/auth/http";
import { consumeAuthAttempt } from "../../src/lib/auth/rate-limit";
import { defaultCategories } from "../../src/lib/finance/default-categories";
import type { PrismaClient } from "../../src/generated/prisma/client";

const context = vi.hoisted(() => ({ requestHeaders: new Headers(), auth: undefined as DuitFlowAuth | undefined, database: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => context.requestHeaders }));
vi.mock("@/lib/auth", () => ({ getAuth: () => context.auth }));
vi.mock("@/lib/db", () => ({ getDatabase: () => context.database }));

import { getUserProfile } from "../../src/lib/auth/profile";
import { requireUser } from "../../src/lib/auth/session";

const environment = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "synthetic-secret-for-auth-tests-at-least-32-characters",
  GITHUB_CLIENT_ID: "synthetic-client", GITHUB_CLIENT_SECRET: "synthetic-client-secret",
};
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let handle: ReturnType<typeof createAuthHttpHandler>;

beforeAll(async () => {
  database = await createTestDatabase();
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  vi.stubEnv("DATABASE_URL", database.connectionString);
  context.database = database.prisma;
  context.auth = createAuth(database.prisma, environment);
  handle = createAuthHttpHandler(context.auth, database.prisma, environment);
});

beforeEach(async () => {
  context.requestHeaders = new Headers();
  await database.prisma.$executeRaw`TRUNCATE "User", "RateLimitEvent", "Verification" CASCADE`;
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await database?.close();
});

async function createUser(name = "Alice") {
  return database.prisma.user.create({ data: { name, email: `${name.toLowerCase()}@example.test` } });
}

async function sessionFor(userId: string, expiresAt = new Date(Date.now() + 3_600_000)) {
  const session = await database.prisma.session.create({ data: { userId, expiresAt, token: crypto.randomUUID() } });
  return fixtureSessionCookie(session.token, environment.BETTER_AUTH_SECRET);
}

function request(path: string, method = "GET", body?: unknown, cookie?: string) {
  return new Request(`${environment.BETTER_AUTH_URL}/api/auth${path}`, {
    method,
    headers: { origin: environment.BETTER_AUTH_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function responseCookies(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("database sessions and authorization through real Prisma", () => {
  it("rejects anonymous DAL access", async () => {
    await expect(getUserProfile("someone")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an unsigned forged cookie", async () => {
    context.requestHeaders = new Headers({ cookie: "duitflow.session_token=forged" });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("reads only the verified user's profile and denies cross-user DAL access", async () => {
    const alice = await createUser();
    const bob = await createUser("Bob");
    context.requestHeaders = new Headers({ cookie: await sessionFor(alice.id) });
    const profile = await getUserProfile(alice.id);
    expect(profile.email).toBe("alice@example.test");
    expect(profile.categories).toHaveLength(defaultCategories.length);
    expect(profile).not.toHaveProperty("sessions");
    await expect(getUserProfile(bob.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects expired and deleted sessions immediately", async () => {
    const alice = await createUser();
    context.requestHeaders = new Headers({ cookie: await sessionFor(alice.id, new Date(Date.now() - 1000)) });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    context.requestHeaders = new Headers({ cookie: await sessionFor(alice.id) });
    expect((await requireUser()).id).toBe(alice.id);
    await database.prisma.session.deleteMany({ where: { userId: alice.id } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("keeps concurrent session lookups isolated between identities", async () => {
    const alice = await createUser();
    const bob = await createUser("Bob");
    const aliceCookie = await sessionFor(alice.id);
    const bobCookie = await sessionFor(bob.id);
    const results = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const expected = index % 2 === 0 ? alice.id : bob.id;
      const cookie = index % 2 === 0 ? aliceCookie : bobCookie;
      const response = await context.auth!.api.getSession({ headers: new Headers({ cookie }), query: { disableCookieCache: true } });
      return { actual: response?.user.id, expected };
    }));
    expect(results.every((result) => result.actual === result.expected)).toBe(true);
  });

  it("seeds exactly the defaults in the user transaction and rolls back on failure", async () => {
    const alice = await createUser();
    const categories = await database.prisma.category.findMany({ where: { userId: alice.id }, select: { name: true, transactionType: true } });
    expect(categories).toEqual(expect.arrayContaining([...defaultCategories]));
    expect(categories).toHaveLength(defaultCategories.length);
    await expect(database.prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: "rollback-user", name: "Rollback", email: "rollback@example.test" } });
      throw new Error("simulated signup failure");
    })).rejects.toThrow("simulated signup failure");
    expect(await database.prisma.user.count({ where: { id: "rollback-user" } })).toBe(0);
    expect(await database.prisma.category.count({ where: { userId: "rollback-user" } })).toBe(0);
  });

  it("sign-out deletes the persisted session and prevents reuse of its cookie", async () => {
    const alice = await createUser();
    const cookie = await sessionFor(alice.id);
    const response = await handle(request("/sign-out", "POST", {}, cookie));
    expect(response.status).toBe(200);
    expect(await database.prisma.session.count({ where: { userId: alice.id } })).toBe(0);
    context.requestHeaders = new Headers({ cookie });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("OAuth HTTP boundary", () => {
  it("rejects cross-origin requests and unsupported credential/linking endpoints", async () => {
    const foreign = request("/sign-in/social", "POST", { provider: "github", callbackURL: "/dashboard" });
    foreign.headers.set("origin", "https://attacker.example");
    expect((await handle(foreign)).status).toBe(403);
    expect((await handle(request("/sign-in/email", "POST", {}))).status).toBe(404);
    expect((await handle(request("/link-social", "POST", {}))).status).toBe(404);
    expect((await handle(request("/sign-out", "POST", {}))).status).toBe(401);
  });

  it("rejects wrong providers, callback redirects, unknown fields, and oversized bodies", async () => {
    for (const body of [
      { provider: "google", callbackURL: "/dashboard" },
      { provider: "github", callbackURL: "https://attacker.example" },
      { provider: "github", callbackURL: "/dashboard", userId: "someone" },
    ]) expect((await handle(request("/sign-in/social", "POST", body))).status).toBe(400);
    expect((await handle(request("/sign-in/social", "POST", { text: "x".repeat(9000) }))).status).toBe(413);
  });

  it("enforces a shared Postgres rate cap with no Redis or raw identity storage", async () => {
    const key = "a".repeat(64);
    expect(await consumeAuthAttempt(database.prisma, key, "test-cap", 2)).toBe(true);
    expect(await consumeAuthAttempt(database.prisma, key, "test-cap", 2)).toBe(true);
    expect(await consumeAuthAttempt(database.prisma, key, "test-cap", 2)).toBe(false);
    const rows = await database.prisma.rateLimitEvent.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.key === key)).toBe(true);
  });

  it("completes OAuth with mocked GitHub only, validates state, and does not create duplicate users", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "synthetic-provider-token", token_type: "bearer", scope: "read:user,user:email" });
      if (url === "https://api.github.com/user") return Response.json({ id: 12345, login: "alice", name: "Alice OAuth", email: "oauth@example.test", avatar_url: null });
      if (url === "https://api.github.com/user/emails") return Response.json([{ email: "oauth@example.test", primary: true, verified: true }]);
      throw new Error("Unexpected external request in auth test");
    });
    try {
      const start = await handle(request("/sign-in/social", "POST", { provider: "github", callbackURL: "/dashboard" }));
      expect(start.status).toBe(200);
      const authorization = new URL((await start.json()).url);
      expect(authorization.origin).toBe("https://github.com");
      expect(authorization.searchParams.get("scope")).not.toContain("repo");
      const state = authorization.searchParams.get("state");
      const callbackPath = `/callback/github?code=synthetic-code&state=${state}`;
      const callback = await handle(request(callbackPath, "GET", undefined, responseCookies(start)));
      expect(callback.status).toBe(302);
      expect(new URL(callback.headers.get("location")!, environment.BETTER_AUTH_URL).href).toBe(`${environment.BETTER_AUTH_URL}/dashboard`);
      expect(await database.prisma.user.count()).toBe(1);
      expect(await database.prisma.category.count()).toBe(defaultCategories.length);
      const account = await database.prisma.account.findFirstOrThrow();
      expect(account.providerId).toBe("github");
      expect(account.accessToken).not.toBe("synthetic-provider-token");
      const activeSession = await handle(request("/get-session", "GET", undefined, responseCookies(callback)));
      expect((await activeSession.json()).user.email).toBe("oauth@example.test");
      const replay = await handle(request(callbackPath, "GET", undefined, responseCookies(start)));
      expect(replay.headers.get("location")).toContain("/sign-in?error=oauth");
      expect(await database.prisma.user.count()).toBe(1);
    } finally { fetchMock.mockRestore(); }
  });
});
