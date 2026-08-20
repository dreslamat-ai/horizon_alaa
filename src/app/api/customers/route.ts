import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const rows = await db.select({
    id: schema.alaaCustomers.id,
    companyNameAr: schema.alaaCustomers.companyNameAr,
    subscriptionStatus: schema.alaaCustomers.subscriptionStatus,
    creditsBalance: schema.alaaCustomers.creditsBalance,
  }).from(schema.alaaCustomers);

  return NextResponse.json({ customers: rows });
}
