// إضافة موظف Horizon لقائمة موظفي ألاء (horizon_staff) — يفعّل SSO من desk
// (بريد مسجَّل ⇐ محادثة مباشرة؛ غير مسجَّل ⇐ fallback لصفحة الدخول). كلمة
// السر عشوائية (الدخول عبر SSO من desk لا بكلمة سر). idempotent.
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import crypto from "crypto";

async function main() {
  const email = process.env.STAFF_EMAIL;
  if (!email) throw new Error("STAFF_EMAIL مطلوب");
  const name = process.env.STAFF_NAME || email;
  const role = (process.env.STAFF_ROLE || "admin") as "admin" | "support";

  const existing = await db.select().from(schema.horizonStaff).where(eq(schema.horizonStaff.email, email)).limit(1);
  if (existing.length) {
    console.log("موجود بالفعل:", email, "| role:", existing[0].role);
    return;
  }
  const pw = crypto.randomBytes(12).toString("base64url");
  const [s] = await db
    .insert(schema.horizonStaff)
    .values({ email, name, passwordHash: await hashPassword(pw), role })
    .returning();
  console.log("أُضيف موظف:", s.email, "| role:", s.role);
}

main().then(() => process.exit(0)).catch((e) => { console.error("فشل:", e.message); process.exit(1); });
