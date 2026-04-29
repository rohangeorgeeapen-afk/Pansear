import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "src", "migrations");

const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "kitchen",
  password: process.env.PGPASSWORD ?? "kitchen",
  database: process.env.PGDATABASE ?? "kitchen",
});

async function main() {
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await pool.query(sql);
  }
  console.log("Migrations done.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
