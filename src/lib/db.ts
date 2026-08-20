import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { join } from "path";
import * as schema from "../../drizzle/schema";

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "alaa.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
