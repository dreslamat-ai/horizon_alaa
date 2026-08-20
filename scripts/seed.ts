// ─── بذر بيانات تجريبية لمرحلة ٢ ──────────────────────────────────────────────
// موظف Horizon واحد (لسجل createdByStaffId فقط — تسجيل الدخول لسه على
// الحساب الثابت في env حتى مرحلة ٤ حسب الخطة)، باقة واحدة، وعميلان
// تجريبيان لاختبار العزل. القيمتان الحاليتان تشيران لنفس
// demo.horizonerp.cloud (بلا حساب ERPNext ثانٍ متاح فعليًا الآن) — يثبت
// آلية اختيار العميل وبناء الاتصال من القاعدة، لا عزل بيانات حقيقي بعد.
import { db, schema } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto";

async function main() {
  const [staff] = await db.insert(schema.horizonStaff).values({
    email: "seed@horizon.local",
    name: "بذرة أولية",
    passwordHash: "n/a", // تسجيل الدخول لسه بالحساب الثابت — يُفعَّل في مرحلة ٤
    role: "admin",
  }).returning();

  const [plan] = await db.insert(schema.alaaPlans).values({
    nameAr: "الأساسية",
    monthlyPriceSar: 0,
    monthlyCreditsAllowance: 200,
  }).returning();

  const erpUrl = process.env.ERPNEXT_URL ?? "https://demo.horizonerp.cloud";
  const erpUsername = process.env.ERPNEXT_USERNAME ?? "";
  const erpPassword = process.env.ERPNEXT_PASSWORD ?? "";
  if (!erpUsername || !erpPassword) {
    throw new Error("ERPNEXT_USERNAME وERPNEXT_PASSWORD مطلوبان في .env.local للبذر");
  }

  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.alaaCustomers).values([
    {
      companyNameAr: "شركة تجريبية أولى",
      companyNameEn: "Test Co A",
      erpUrl,
      erpUsername,
      erpPasswordEnc: encryptSecret(erpPassword),
      planId: plan.id,
      subscriptionStatus: "active",
      subscriptionEndDate: oneYear,
      creditsBalance: plan.monthlyCreditsAllowance,
      monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
      createdByStaffId: staff.id,
    },
    {
      companyNameAr: "شركة تجريبية ثانية",
      companyNameEn: "Test Co B",
      erpUrl,
      erpUsername,
      erpPasswordEnc: encryptSecret(erpPassword),
      planId: plan.id,
      subscriptionStatus: "active",
      subscriptionEndDate: oneYear,
      creditsBalance: 0, // عمدًا صفر — لاختبار منع النفاد
      monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
      createdByStaffId: staff.id,
    },
  ]);

  console.log("تمّ البذر: موظف واحد، باقة واحدة، عميلان (الثاني برصيد صفر عمدًا).");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
