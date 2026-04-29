import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "kitchen",
  password: process.env.PGPASSWORD ?? "kitchen",
  database: process.env.PGDATABASE ?? "kitchen",
});
