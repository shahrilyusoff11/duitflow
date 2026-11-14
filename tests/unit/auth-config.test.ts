import { describe, expect, it } from "vitest";
import { readAuthEnvironment } from "../../src/lib/config/auth";
import { authRateLimitKey } from "../../src/lib/auth/rate-limit";

const valid = {
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "a-synthetic-test-secret-longer-than-thirty-two-characters",
  GITHUB_CLIENT_ID: "synthetic-client", GITHUB_CLIENT_SECRET: "synthetic-secret",
};

describe("authentication configuration", () => {
  it("accepts the explicit local origin and HTTPS deployed origins", () => {
    expect(readAuthEnvironment(valid).BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL);
    expect(readAuthEnvironment({ ...valid, BETTER_AUTH_URL: "https://example.test" }).BETTER_AUTH_URL).toBe("https://example.test");
  });
  it.each(["http://example.test", "https://example.test/path", "https://example.test/", "https://user:password@example.test"])("rejects unsafe or ambiguous base URL %s", (BETTER_AUTH_URL) => {
    expect(() => readAuthEnvironment({ ...valid, BETTER_AUTH_URL })).toThrow("Authentication configuration is missing or invalid.");
  });
  it("fails closed without a strong secret and never includes supplied secrets in errors", () => {
    expect(() => readAuthEnvironment({ ...valid, BETTER_AUTH_SECRET: "sensitive-value" })).toThrow("Authentication configuration is missing or invalid.");
    expect(() => readAuthEnvironment({ ...valid, GITHUB_CLIENT_SECRET: "" })).toThrow();
  });
  it("ignores spoofable IP headers outside the trusted hosting platform", () => {
    const first = new Headers({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "192.0.2.9" });
    const second = new Headers({ "x-vercel-forwarded-for": "192.0.2.2" });
    expect(authRateLimitKey(first, valid.BETTER_AUTH_SECRET, false)).toBe(authRateLimitKey(second, valid.BETTER_AUTH_SECRET, false));
    expect(authRateLimitKey(first, valid.BETTER_AUTH_SECRET, true)).not.toBe(authRateLimitKey(second, valid.BETTER_AUTH_SECRET, true));
    expect(authRateLimitKey(first, valid.BETTER_AUTH_SECRET, true)).toMatch(/^[a-f0-9]{64}$/);
  });
});
