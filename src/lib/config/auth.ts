import { z } from "zod";

const origin = z.url().refine((value) => {
  const url = URL.parse(value);
  return !!url && url.origin === value && (
    url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  );
}, "Use an HTTPS origin, or HTTP on localhost only.");

const authEnvironment = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: origin,
  GITHUB_CLIENT_ID: z.string().trim().min(1),
  GITHUB_CLIENT_SECRET: z.string().trim().min(1),
});

export type AuthEnvironment = z.infer<typeof authEnvironment>;

export function readAuthEnvironment(environment: Record<string, string | undefined>): AuthEnvironment {
  const result = authEnvironment.safeParse(environment);
  if (!result.success) throw new Error("Authentication configuration is missing or invalid.");
  return result.data;
}

export function isAuthConfigured(environment: Record<string, string | undefined>): boolean {
  return authEnvironment.safeParse(environment).success && !!environment.DATABASE_URL;
}
