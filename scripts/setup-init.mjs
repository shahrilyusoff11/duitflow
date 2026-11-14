import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

try {
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const local = example.replace('BETTER_AUTH_SECRET=""', `BETTER_AUTH_SECRET="${randomBytes(48).toString("base64url")}"`);
  await writeFile(new URL("../.env", import.meta.url), local, { flag: "wx", mode: 0o600 });
  console.log("Created ignored .env with a generated auth secret. Add your GitHub and database credentials locally.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    console.log(".env already exists and was left unchanged.");
  } else {
    console.error("Unable to create local environment file. No secret values were printed.");
    process.exitCode = 1;
  }
}
