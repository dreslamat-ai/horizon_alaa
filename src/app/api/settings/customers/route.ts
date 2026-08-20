import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { testErpConnection } from "@/lib/erp/erpConnection";

export async function GET(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const rows = await db.select({
    id: schema.alaaCustomers.id,
    companyNameAr: schema.alaaCustomers.companyNameAr,
    companyNameEn: schema.alaaCustomers.companyNameEn,
    erpUrl: schema.alaaCustomers.erpUrl,
    erpUsername: schema.alaaCustomers.erpUsername,
    planId: schema.alaaCustomers.planId,
    subscriptionStatus: schema.alaaCustomers.subscriptionStatus,
    subscriptionEndDate: schema.alaaCustomers.subscriptionEndDate,
    creditsBalance: schema.alaaCustomers.creditsBalance,
    monthlyCreditsAllowance: schema.alaaCustomers.monthlyCreditsAllowance,
  }).from(schema.alaaCustomers);

  return NextResponse.json({ customers: rows });
}

export async function POST(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    companyNameAr?: string;
    companyNameEn?: string;
    erpUrl?: string;
    erpUsername?: string;
    erpPassword?: string;
    planId?: number;
    subscriptionMonths?: number;
  } | null;

  if (!body?.companyNameAr || !body?.erpUrl || !body?.erpUsername || !body?.erpPassword || !body?.planId) {
    return NextResponse.json({ error: "اسم الشركة وبيانات الاتصال والباقة مطلوبة" }, { status: 400 });
  }

  // ─── الاتصال يُختبر هنا أيضًا، لا في الواجهة فقط ────────────────────────
  // زر "اختبار الاتصال" في النموذج تجربة استباقية للموظف، لكن الحفظ نفسه
  // لا يمر لو الاتصال فعليًا فاشل — تجاوز الزر (نداء مباشر للـAPI) لا يخلق
  // عميلًا ببيانات اعتماد لم تُتحقق منها.
  const test = await testErpConnection(body.erpUrl, body.erpUsername, body.erpPassword);
  if (!test.ok) {
    return NextResponse.json({ error: `تعذّر التحقق من اتصال ERPNext: ${test.error}` }, { status: 422 });
  }

  const plan = (await db.select().from(schema.alaaPlans).where(eq(schema.alaaPlans.id, body.planId)).limit(1))[0];
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 400 });

  // هوية الموظف الحقيقية من الجلسة تُبنى في مرحلة ٤ (نظام تسجيل دخول حقيقي
  // مربوط بـhorizon_staff). حاليًا: أول صف موجود، أو صف يُنشأ إن لم يوجد —
  // بلا استخدام رقم ثابت مفترَض قد لا يطابق ما زرعه seed.ts فعليًا.
  const existingStaff = (await db.select().from(schema.horizonStaff).limit(1))[0];
  const staffRow = existingStaff ?? (await db.insert(schema.horizonStaff).values({
    email: staff.email,
    name: staff.name,
    passwordHash: "n/a",
    role: "admin",
  }).returning())[0];

  const months = body.subscriptionMonths ?? 1;
  const endDate = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

  const [customer] = await db.insert(schema.alaaCustomers).values({
    companyNameAr: body.companyNameAr,
    companyNameEn: body.companyNameEn,
    erpUrl: body.erpUrl.replace(/\/+$/, ""),
    erpUsername: body.erpUsername,
    erpPasswordEnc: encryptSecret(body.erpPassword),
    planId: plan.id,
    subscriptionStatus: "trial",
    subscriptionEndDate: endDate,
    creditsBalance: plan.monthlyCreditsAllowance,
    monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
    createdByStaffId: staffRow.id,
  }).returning();

  return NextResponse.json({ customer, loggedInAs: test.loggedInAs });
}
