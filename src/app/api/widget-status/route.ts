import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// مسار عام بلا جلسة عمدًا — بيرجّع حالة تقريبية جدًا (نافد/سليم) لا أرقام
// حقيقية، عشان زرّ desk (horizon_desk_theme) يقدر يلوّن مؤشره قبل ما
// الموظف يفتح اللوحة أصلاً — نفس منطق نقطة "أونلاين" في شهد، بس هنا
// بتعكس حالة رصيد العميل المرتبط بالـsite الحالي لا مجرد "الموقع شغّال".
export async function GET(req: NextRequest) {
  const site = req.nextUrl.searchParams.get("site");
  if (!site) return NextResponse.json({ low: false });

  const rows = await db.select({
    creditsBalance: schema.alaaCustomers.creditsBalance,
    subscriptionStatus: schema.alaaCustomers.subscriptionStatus,
    erpUrl: schema.alaaCustomers.erpUrl,
  }).from(schema.alaaCustomers);

  const match = rows.find(c => c.erpUrl.includes(site));
  if (!match) return NextResponse.json({ low: false });

  const low = match.creditsBalance <= 0
    || match.subscriptionStatus === "suspended"
    || match.subscriptionStatus === "cancelled";
  return NextResponse.json({ low });
}
