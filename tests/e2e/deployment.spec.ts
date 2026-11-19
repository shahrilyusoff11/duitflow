import { expect, test } from "@playwright/test";

test("public responses protect embedding, referrers and content interpretation", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("private endpoints remain uncached, unindexed and session or secret protected", async ({ request }) => {
  const profile = await request.get("/api/profile");
  expect(profile.status()).toBe(401);
  expect(profile.headers()["cache-control"]).toContain("no-store");
  expect(profile.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const webhook = await request.post("/api/telegram/webhook", { data: {} });
  expect(webhook.status()).toBe(401);
  expect(webhook.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const notifications = await request.get("/api/telegram/notifications");
  expect(notifications.status()).toBe(401);
  expect(notifications.headers()["cache-control"]).toContain("no-store");
  expect(notifications.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const signIn = await request.get("/sign-in");
  expect(signIn.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /settings");
});
