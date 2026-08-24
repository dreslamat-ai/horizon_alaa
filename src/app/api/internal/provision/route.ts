// ─── تجهيز عميل ألاء لموقع مستأجر — يستدعيه provisioner منصة Horizon-Saas ────
// idempotent بالموقع: نفس site يُحدَّث اتصاله ولا يُكرَّر صفّه ولا يُمنح
// رصيدًا تجريبيًا ثانيًا. المفتاح السري (API Secret بتاع الموقع) يوصل في
// جسم الطلب على 127.0.0.1 ويُشفَّر فورًا (AES-256-GCM) — لا يُخزَّن خامًا.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { isInternalRequest } from "@/lib/internalAuth";

// باقة التجربة تُنشأ عند أول تجهيز إن لم توجد. الكتابة مسموحة فيها عمدًا:
// وضع التسجيل في ألاء محكوم أصلًا (مسودة دائمًا + تأكيد صريح لكل مستند)،
// والتجربة تعرض القدرة الكاملة كما تعرض تجربة النظام نفسه كل ميزاته.
// السعر صفر placeholder — التسعير الفعلي قرار المالك في alaa_plans.
const TRIAL_PLAN_NAME = "تجربة ألاء";
const TRIAL_CREDITS = 500;
const TRIAL_DAYS = 14;

async function getOrCreateTrialPlan() {
  const [existing] = await db.select().from(schema.alaaPlans)
    .where(eq(schema.alaaPlans.nameAr, TRIAL_PLAN_NAME)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(schema.alaaPlans).values({
    nameAr: TRIAL_PLAN_NAME,
    monthlyPriceSar: 0,
    monthlyCreditsAllowance: TRIAL_CREDITS,
    allowWrites: true,
  }).returning();
  return created;
}

export async function POST(req: NextRequest) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: "غير مصرَّح" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    site?: string; companyNameAr?: string; companyNameEn?: string;
    apiKey?: string; apiSecret?: string; trialDays?: number; credits?: number;
  } | null;
  if (!body?.site || !body.apiKey || !body.apiSecret) {
    return NextResponse.json({ error: "site وapiKey وapiSecret مطلوبون" }, { status: 400 });
  }

  const erpUrl = `https://${body.site.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const connection = {
    authType: "api_key" as const,
    erpUrl,
    erpUsername: body.apiKey,
    erpPasswordEnc: encryptSecret(body.apiSecret),
  };

  const [existing] = await db.select().from(schema.alaaCustomers)
    .where(eq(schema.alaaCustomers.erpUrl, erpUrl)).limit(1);
  if (existing) {
    // موقع سبق تجهيزه — تحديث الاتصال فقط (مفتاح اتجدد مثلًا)، بلا أي
    // مساس بالرصيد أو الاشتراك: إعادة تشغيل provisioner لا تمنح نقاطًا.
    await db.update(schema.alaaCustomers)
      .set({ ...connection, updatedAt: new Date().toISOString() })
      .where(eq(schema.alaaCustomers.id, existing.id));
    return NextResponse.json({ ok: true, customerId: existing.id, existing: true });
  }

  const plan = await getOrCreateTrialPlan();
  // createdByStaffId إلزامي في المخطط — يُنسب لأول إداري (عملية نظامية)
  const [admin] = await db.select().from(schema.horizonStaff)
    .where(eq(schema.horizonStaff.role, "admin")).limit(1);
  const [anyStaff] = admin ? [admin] : await db.select().from(schema.horizonStaff).limit(1);
  if (!anyStaff) return NextResponse.json({ error: "لا يوجد موظف في horizon_staff لنسب الإنشاء إليه" }, { status: 500 });

  const credits = body.credits ?? TRIAL_CREDITS;
  const trialDays = body.trialDays ?? TRIAL_DAYS;
  const [customer] = await db.insert(schema.alaaCustomers).values({
    companyNameAr: body.companyNameAr || body.site,
    companyNameEn: body.companyNameEn ?? null,
    ...connection,
    planId: plan.id,
    subscriptionStatus: "trial",
    subscriptionEndDate: new Date(Date.now() + trialDays * 864e5).toISOString(),
    creditsBalance: credits,
    monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
    createdByStaffId: anyStaff.id,
  }).returning();

  await db.insert(schema.alaaCreditTransactions).values({
    alaaCustomerId: customer.id,
    type: "topup",
    amount: credits,
    balanceAfter: credits,
    note: `رصيد تجريبي عند تفعيل الموقع (${trialDays} يوم)`,
  });

  return NextResponse.json({ ok: true, customerId: customer.id, existing: false });
}
