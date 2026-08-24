// ─── مطفرات باقات ألاء: الفلترة والتجديد الشهري بالاتجاهين ──────────────────
// بوابة تُشغَّل قبل أي تعديل على منطق الباقات:
//   rm -f /tmp/alaa-test.db && DATABASE_PATH=/tmp/alaa-test.db npx drizzle-kit push --force \
//   && DATABASE_PATH=/tmp/alaa-test.db ALAA_ENC_SECRET=test npx tsx scripts/test-plans-mutations.ts
if (!process.env.DATABASE_PATH || process.env.DATABASE_PATH.includes("data/alaa.db")) {
  console.error("حارس: السكربت بيكتب بيانات اختبار — شغّله بقاعدة مؤقتة عبر DATABASE_PATH، مش قاعدة الإنتاج");
  process.exit(1);
}
import { toolsForPlan, WRITE_TOOLS } from "../src/lib/agent/agentModes";
import { TOOLS } from "../src/lib/agent/toolDefinitions";
import { db, schema } from "../src/lib/db";
import { assertAlaaAccessAllowed } from "../src/lib/credits";
import { eq } from "drizzle-orm";

let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failed++;
}

async function main() {
  // ─── ١) فلترة الأدوات (دالة صافية) ───
  const names = (ts: Array<{ function: { name: string } }>) => ts.map(t => t.function.name);
  const full = toolsForPlan([...TOOLS], { allowWrites: true, allowDepartments: true });
  const readOnly = toolsForPlan([...TOOLS], { allowWrites: false, allowDepartments: false });
  const proTier = toolsForPlan([...TOOLS], { allowWrites: true, allowDepartments: false });

  check("الفريق الكامل: department_review موجودة", names(full).includes("department_review"));
  check("أساسي: department_review محجوبة", !names(readOnly).includes("department_review"));
  check("محترف: كتابة موجودة وأقسام محجوبة",
    names(proTier).includes("create_invoice") && !names(proTier).includes("department_review"));
  const leakedWrites = names(readOnly).filter(n => WRITE_TOOLS.has(n));
  check("أساسي: صفر أدوات كتابة مسربة", leakedWrites.length === 0, leakedWrites.join(","));
  const knownWrites = ["create_supplier", "create_purchase_invoice", "create_journal_entry",
    "update_document", "cancel_document", "delete_document", "create_custom_field",
    "create_print_format", "create_workflow"];
  const missing = knownWrites.filter(n => names(readOnly).includes(n));
  check("الأدوات التسع اللي كانت مسربة اتحجبت", missing.length === 0, missing.join(","));

  // ─── ٢) التجديد الشهري على قاعدة مؤقتة ───
  const [plan] = await db.insert(schema.alaaPlans).values({
    nameAr: "باقة اختبار", monthlyPriceSar: 49, monthlyCreditsAllowance: 100,
    allowWrites: false, allowDepartments: false, allowTelegram: false, allowDailyDigest: false,
  }).returning();
  const [staff] = await db.insert(schema.horizonStaff).values({
    email: "t@t.t", name: "اختبار", passwordHash: "x", role: "admin",
  }).returning();

  const twoMonthsAgo = new Date(Date.now() - 62 * 864e5).toISOString();
  const future = new Date(Date.now() + 30 * 864e5).toISOString();
  const base = {
    planId: plan.id, createdByStaffId: staff.id, authType: "api_key" as const,
    erpUrl: "https://x1.test", erpUsername: "k", erpPasswordEnc: "e",
    monthlyCreditsAllowance: 100, subscriptionEndDate: future,
  };

  // نشط + عدّى شهر + رصيد منخفض ⟵ يتجدد لـ100
  const [c1] = await db.insert(schema.alaaCustomers).values({
    ...base, companyNameAr: "ن١", subscriptionStatus: "active",
    creditsBalance: 3, creditsResetAt: twoMonthsAgo,
  }).returning();
  const r1 = await assertAlaaAccessAllowed(c1.id);
  check("نشط عدّى شهر: الرصيد اتجدد 3→100", r1.ok && r1.customer.creditsBalance === 100,
    r1.ok ? String(r1.customer.creditsBalance) : r1.reason);
  const tx1 = await db.select().from(schema.alaaCreditTransactions)
    .where(eq(schema.alaaCreditTransactions.alaaCustomerId, c1.id));
  check("صف monthly_refill اتسجل بقيمة +97",
    tx1.length === 1 && tx1[0].type === "monthly_refill" && tx1[0].amount === 97);

  // نشط + عدّى شهر + رصيد مشحون أعلى من المخصص ⟵ لا مصادرة
  const [c2] = await db.insert(schema.alaaCustomers).values({
    ...base, erpUrl: "https://x2.test", companyNameAr: "ن٢", subscriptionStatus: "active",
    creditsBalance: 4000, creditsResetAt: twoMonthsAgo,
  }).returning();
  const r2 = await assertAlaaAccessAllowed(c2.id);
  check("رصيد مشحون 4000 فوق المخصص: ماتمسّش", r2.ok && r2.customer.creditsBalance === 4000);
  const tx2 = await db.select().from(schema.alaaCreditTransactions)
    .where(eq(schema.alaaCreditTransactions.alaaCustomerId, c2.id));
  check("ولا صف معاملة له (لا تغيير = لا سجل)", tx2.length === 0);

  // تجربة + عدّى شهر ⟵ لا تجديد (رصيد واحد)
  const [c3] = await db.insert(schema.alaaCustomers).values({
    ...base, erpUrl: "https://x3.test", companyNameAr: "ن٣", subscriptionStatus: "trial",
    creditsBalance: 5, creditsResetAt: twoMonthsAgo,
  }).returning();
  const r3 = await assertAlaaAccessAllowed(c3.id);
  check("تجربة عدّى شهر: لا تجديد (فضل 5)", r3.ok && r3.customer.creditsBalance === 5);

  // نشط + لسه في شهره ⟵ لا تجديد
  const [c4] = await db.insert(schema.alaaCustomers).values({
    ...base, erpUrl: "https://x4.test", companyNameAr: "ن٤", subscriptionStatus: "active",
    creditsBalance: 7, creditsResetAt: new Date(Date.now() - 5 * 864e5).toISOString(),
  }).returning();
  const r4 = await assertAlaaAccessAllowed(c4.id);
  check("نشط جوه شهره: لا تجديد (فضل 7)", r4.ok && r4.customer.creditsBalance === 7);

  console.log(failed === 0 ? "\nكل المطفرات عدّت" : `\n${failed} مطفرة سقطت`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error("فشل:", e); process.exit(1); });
