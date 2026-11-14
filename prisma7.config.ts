import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationConnectionString } from "./src/lib/config/database";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // An absent URL permits offline generate/validate/diff. Migration commands
  // use Neon's direct URL (or DIRECT_URL); never use the pooled runtime URL.
  datasource: { url: migrationConnectionString(process.env) },
});
