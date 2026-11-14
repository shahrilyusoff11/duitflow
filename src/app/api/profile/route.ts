import { AccessError, userFromHeaders } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/auth/profile";
import { authJson } from "@/lib/auth/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await userFromHeaders(request.headers);
    if (!user) return authJson({ error: "UNAUTHENTICATED" }, 401);
    // Identity comes exclusively from the verified session. Query parameters
    // cannot select another owner, and the DAL independently checks the session.
    return authJson(await getUserProfile(user.id), 200);
  } catch (error) {
    if (error instanceof AccessError) return authJson({ error: error.code }, error.code === "FORBIDDEN" ? 403 : 401);
    return authJson({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
