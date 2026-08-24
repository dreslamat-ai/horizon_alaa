// ─── بذر باقات ألاء المعتمدة (تصور ٢٥ أغسطس، docs/plans-proposal.md) ─────────
// idempotent بالاسم: الموجود يُحدَّث سعره ونقاطه وأعلامه، والجديد يُنشأ —
// إعادة التشغيل آمنة دائمًا. التشغيل:
//   npx tsx --env-file=.env.local scripts/seed-plans.ts
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";

// المصدر الوحيد للأرقام المعتمدة — تعديل الباقات يقع هنا ثم يعاد التشغيل
const PLANS = [
  {
    nameAr: "تجربة ألاء",
    monthlyPriceSar: 0, monthlyCreditsAllowance: 200,
    // كل القدرات مفتوحة عمدًا: العميل يدوق الفريق كامل ثم يختار مستواه
    allowWrites: true, allowDepartments: true, allowTelegram: true, allowDailyDigest: true,
  },
  {
    nameAr: "ألاء أساسي",
    monthlyPriceSar: 49, monthlyCreditsAllowance: 100,
    allowWrites: false, allowDepartments: false, allowTelegram: false, allowDailyDigest: false,
  },
  {
    nameAr: "ألاء محترف",
    monthlyPriceSar: 149, monthlyCreditsAllowance: 250,
    allowWrites: true, allowDepartments: false, allowTelegram: false, allowDailyDigest: false,
  },
  {
    nameAr: "ألاء الفريق الكامل",
    monthlyPriceSar: 299, monthlyCreditsAllowance: 600,
    allowWrites: true, allowDepartments: true, allowTelegram: true, allowDailyDigest: true,
  },
];

async function main() {
  for (const plan of PLANS) {
    const [existing] = await db.select().from(schema.alaaPlans)
      .where(eq(schema.alaaPlans.nameAr, plan.nameAr)).limit(1);
    if (existing) {
      await db.update(schema.alaaPlans).set(plan).where(eq(schema.alaaPlans.id, existing.id));
      console.log(`حُدِّثت: ${plan.nameAr} (id ${existing.id})`);
    } else {
      const [created] = await db.insert(schema.alaaPlans).values(plan).returning();
      console.log(`أُنشئت: ${plan.nameAr} (id ${created.id})`);
    }
  }
  const all = await db.select().from(schema.alaaPlans);
  console.log("كل الباقات:", JSON.stringify(all.map(p => ({
    id: p.id, name: p.nameAr, price: p.monthlyPriceSar, credits: p.monthlyCreditsAllowance,
    writes: p.allowWrites, departments: p.allowDepartments,
  }))));
}

main().then(() => process.exit(0)).catch(e => { console.error("فشل:", e.message); process.exit(1); });
