// ─── قائمة باقات ألاء — تعرضها صفحة «اشتراكي والفواتير» عبر بروكسي control ───
import { NextRequest, NextResponse } from "next/server";
import { gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isInternalRequest } from "@/lib/internalAuth";

export async function GET(req: NextRequest) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: "غير مصرَّح" }, { status: 401 });

  // الباقات المدفوعة فقط (السعر > 0) — التجربة تُمنح تلقائيًا لا تُشترى
  const rows = await db.select().from(schema.alaaPlans)
    .where(gt(schema.alaaPlans.monthlyPriceSar, 0));

  return NextResponse.json({
    plans: rows.map(p => ({
      nameAr: p.nameAr,
      monthlyPriceSar: p.monthlyPriceSar,
      monthlyCreditsAllowance: p.monthlyCreditsAllowance,
      allowWrites: p.allowWrites,
      allowDepartments: p.allowDepartments,
      allowTelegram: p.allowTelegram,
      allowDailyDigest: p.allowDailyDigest,
    })),
  });
}
