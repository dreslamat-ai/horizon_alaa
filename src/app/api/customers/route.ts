import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAnySession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await requireAnySession(req);
  if (!session) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const fields = {
    id: schema.alaaCustomers.id,
    companyNameAr: schema.alaaCustomers.companyNameAr,
    subscriptionStatus: schema.alaaCustomers.subscriptionStatus,
    creditsBalance: schema.alaaCustomers.creditsBalance,
    erpUrl: schema.alaaCustomers.erpUrl, // لمطابقة site الحالي واختيار العميل تلقائيًا
  };

  // المستأجر يرى صفّه هو فقط — لا قائمة عملاء Horizon كلها.
  const rows = session.kind === "customer"
    ? await db.select(fields).from(schema.alaaCustomers).where(eq(schema.alaaCustomers.id, session.customerId))
    : await db.select(fields).from(schema.alaaCustomers);

  return NextResponse.json({ customers: rows });
}
