// ─── ربط عميل ERPNext بألاء عبر مفتاح API (authType=api_key، صلاحيات كاملة) ──
// يقرأ بيانات الاتصال من ملف JSON خارجي (يكتبه frappe generate_keys على
// الخادم نفسه)، فلا يمرّ الـsecret في سطر أوامر ولا في مخرجات — يُشفَّر هنا
// مباشرة (encryptSecret، نفس مفتاح ALAA_ENC_SECRET) ثم يُمسح ملف المصدر.
// idempotent: نفس erpUrl يُحدَّث لا يُكرَّر صفّه. لا حقل مُخترَع — كل الحقول
// الإلزامية (subscriptionEndDate/monthlyCreditsAllowance/createdByStaffId)
// مقروءة من الباقة والموظف الفعليين في القاعدة، لا مفترَضة.
import { readFileSync, unlinkSync } from "fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto";

async function main() {
  const src = process.env.ERP_KEY_FILE;
  if (!src) throw new Error("ERP_KEY_FILE مطلوب (مسار ملف JSON فيه key/secret/url)");
  const j = JSON.parse(readFileSync(src, "utf8"));
  if (!j.key || !j.secret || !j.url) throw new Error("ملف المفتاح ناقص حقلًا (key/secret/url)");

  const [plan] = await db.select().from(schema.alaaPlans).limit(1);
  if (!plan) throw new Error("لا توجد باقة في alaa_plans");
  const [staff] = await db.select().from(schema.horizonStaff).limit(1);
  if (!staff) throw new Error("لا يوجد موظف في horizon_staff");

  const cleanUrl = String(j.url).replace(/\/+$/, "");
  const values = {
    companyNameAr: j.companyAr || "Horizon",
    companyNameEn: j.companyEn ?? null,
    authType: "api_key" as const,
    erpUrl: cleanUrl,
    erpUsername: j.key,
    erpPasswordEnc: encryptSecret(j.secret),
    planId: plan.id,
    subscriptionStatus: "active" as const,
    subscriptionEndDate: new Date(Date.now() + 365 * 864e5).toISOString(),
    creditsBalance: plan.monthlyCreditsAllowance,
    monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
    createdByStaffId: staff.id,
  };

  const existing = await db
    .select()
    .from(schema.alaaCustomers)
    .where(eq(schema.alaaCustomers.erpUrl, cleanUrl))
    .limit(1);

  if (existing.length) {
    await db.update(schema.alaaCustomers).set(values).where(eq(schema.alaaCustomers.id, existing[0].id));
    console.log("حُدِّث العميل id", existing[0].id, "->", cleanUrl);
  } else {
    const [c] = await db.insert(schema.alaaCustomers).values(values).returning();
    console.log("أُضيف العميل id", c.id, "->", cleanUrl);
  }
  unlinkSync(src);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("فشل:", e.message);
    process.exit(1);
  });
