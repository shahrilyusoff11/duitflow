import { describe, expect, it } from "vitest";
import { databaseConnectionString, migrationConnectionString } from "../../src/lib/config/database";

describe("database configuration", () => {
  it("uses the Neon-pulled direct URL ahead of a legacy placeholder", () => {
    const direct = "postgresql://localhost/neon_test";
    expect(migrationConnectionString({ DATABASE_URL_UNPOOLED: direct, DIRECT_URL: "postgresql://USER:PASSWORD@HOST/DATABASE" })).toBe(direct);
  });

  it("supports conventional direct URLs without falling back to app pooling", () => {
    expect(migrationConnectionString({ DIRECT_URL: "postgresql://localhost/test" })).toBe("postgresql://localhost/test");
    expect(migrationConnectionString({ DATABASE_URL: "postgresql://localhost-pooler/test" })).toBe("");
    expect(() => migrationConnectionString({ DATABASE_URL_UNPOOLED: "postgresql://host-pooler.example.test/test" })).toThrow("Migrations require a valid direct PostgreSQL URL");
  });
  it.each([undefined, "", "invalid", "https://example.test/database"])(
    "fails closed for an invalid or absent application URL (%s)", (url) => {
      expect(() => databaseConnectionString({ DATABASE_URL: url })).toThrow(
        "DATABASE_URL must be a valid PostgreSQL connection URL.",
      );
    },
  );

  it("never substitutes the migration URL for a missing app URL", () => {
    expect(() => databaseConnectionString({ DIRECT_URL: "postgresql://localhost/test" })).toThrow();
  });

  it.each(["postgres:", "postgresql:"])("accepts conventional %s URLs", (protocol) => {
    const url = `${protocol}//user:synthetic-password@localhost:5432/test`;
    expect(databaseConnectionString({ DATABASE_URL: url })).toBe(url);
  });

  it("does not leak a rejected URL or its password in the error", () => {
    const secret = "synthetic-password-that-must-not-be-logged";
    try {
      databaseConnectionString({ DATABASE_URL: `https://user:${secret}@example.test` });
      expect.fail("The invalid protocol must be rejected");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("example.test");
    }
  });
});
