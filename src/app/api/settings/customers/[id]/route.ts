import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

const VALID_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const { id } = await ctx.params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    subscriptionStatus?: string;
    extendMonths?: number;
    companyNameAr?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const rows = await db.select().from(schema.alaaCustomers).where(eq(schema.alaaCustomers.id, customerId)).limit(1);
  const customer = rows[0];
  if (!customer) return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });

  const update: Partial<typeof schema.alaaCustomers.$inferInsert> = {};

  if (body.companyNameAr) update.companyNameAr = body.companyNameAr;

  if (body.subscriptionStatus) {
    if (!VALID_STATUSES.includes(body.subscriptionStatus as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: "حالة اشتراك غير معروفة" }, { status: 400 });
    }
    update.subscriptionStatus = body.subscriptionStatus as typeof VALID_STATUSES[number];
  }

  if (typeof body.extendMonths === "number" && body.extendMonths > 0) {
    // التمديد من تاريخ الانتهاء الحالي لا من الآن — عميل مدّد قبل الانتهاء
    // بأسبوع لا يخسر الأسبوع المتبقي.
    const base = new Date(customer.subscriptionEndDate);
    const from = Number.isNaN(base.getTime()) || base.getTime() < Date.now() ? new Date() : base;
    update.subscriptionEndDate = new Date(from.getTime() + body.extendMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
    // التمديد نشاطٌ إداري صريح — إن كان الاشتراك موقوفًا يُعاد تفعيله ضمنيًا
    if (customer.subscriptionStatus === "suspended" || customer.subscriptionStatus === "cancelled") {
      update.subscriptionStatus = "active";
    }
  }

  update.updatedAt = new Date().toISOString();

  const [updated] = await db.update(schema.alaaCustomers).set(update).where(eq(schema.alaaCustomers.id, customerId)).returning();
  return NextResponse.json({ customer: updated });
}
