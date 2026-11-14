import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { join } from "path";
import * as schema from "../../drizzle/schema";

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "alaa.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ضمان عمود alaa_customers.locale على قواعد قائمة (migration 0001) — idempotent:
// SQLite يرفض الإضافة المكرّرة بخطأ نبتلعه. لا يحلّ محل drizzle-kit migrate،
// لكنه يمنع تعطّل /api/chat لو نُشر الكود قبل تشغيل الهجرة.
try { sqlite.exec("ALTER TABLE alaa_customers ADD COLUMN locale text"); } catch { /* موجود */ }

export const db = drizzle(sqlite, { schema });
export { schema };
