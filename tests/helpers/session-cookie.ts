import { createHmac } from "node:crypto";

// Test fixtures only. Production cookies are issued and verified by Better Auth.
// This signs an actual seeded DB session token; no app test/bypass endpoint exists.
export function fixtureSessionCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `duitflow.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}
