// ─── قراءة رصيد ألاء لموقع — تستهلكه صفحة «اشتراكي والفواتير» في horizon_client ─
import { NextRequest, NextResponse } from "next/server";
import { eq, like } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isInternalRequest } from "@/lib/internalAuth";

export async function GET(req: NextRequest) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: "غير مصرَّح" }, { status: 401 });

  const site = req.nextUrl.searchParams.get("site");
  if (!site) return NextResponse.json({ error: "site مطلوب" }, { status: 400 });

  const rows = await db.select().from(schema.alaaCustomers)
    .where(like(schema.alaaCustomers.erpUrl, `%${site}%`));
  const customer = rows.find(c => {
    try { return new URL(c.erpUrl).host === site; } catch { return false; }
  });
  if (!customer) return NextResponse.json({ error: "لا عميل لهذا الموقع" }, { status: 404 });

  const [plan] = await db.select().from(schema.alaaPlans)
    .where(eq(schema.alaaPlans.id, customer.planId)).limit(1);

  return NextResponse.json({
    companyNameAr: customer.companyNameAr,
    creditsBalance: customer.creditsBalance,
    subscriptionStatus: customer.subscriptionStatus,
    subscriptionEndDate: customer.subscriptionEndDate,
    plan: plan ? {
      nameAr: plan.nameAr,
      monthlyPriceSar: plan.monthlyPriceSar,
      monthlyCreditsAllowance: plan.monthlyCreditsAllowance,
    } : null,
  });
}
