import "server-only";
import { getDatabase } from "@/lib/db";
import { readAuthEnvironment } from "@/lib/config/auth";
import { createAuth, type DuitFlowAuth } from "./create-auth";

let instance: DuitFlowAuth | undefined;

export function getAuth(): DuitFlowAuth {
  instance ??= createAuth(getDatabase(), readAuthEnvironment(process.env));
  return instance;
}
