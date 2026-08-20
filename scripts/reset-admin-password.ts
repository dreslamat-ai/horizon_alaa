import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error("الاستخدام: tsx reset-admin-password.ts <email> <new-password>");
    process.exit(1);
  }
  const hash = await hashPassword(newPassword);
  const [updated] = await db.update(schema.horizonStaff).set({ passwordHash: hash }).where(eq(schema.horizonStaff.email, email)).returning();
  if (!updated) {
    console.error("مفيش موظف بهذا البريد");
    process.exit(1);
  }
  console.log(`تم تحديث كلمة سر ${updated.email}`);
}
main();
