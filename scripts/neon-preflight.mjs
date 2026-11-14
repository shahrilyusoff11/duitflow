import "dotenv/config";
import pg from "pg";
import { migrationConnectionString } from "../src/lib/config/database.ts";

const connectionString = migrationConnectionString(process.env);
if (!connectionString) throw new Error("Direct database connection is not configured.");
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  const result = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log(JSON.stringify({ connected: true, publicTables: result.rows.map((row) => row.table_name) }));
} catch (error) {
  console.error(JSON.stringify({ connected: false, code: error.code ?? "CONNECTION_FAILED" }));
  process.exitCode = 1;
} finally {
  await client.end();
}
