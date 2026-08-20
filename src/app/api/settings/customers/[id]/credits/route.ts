import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

/** منح نقاط يدويًا — حالات استثنائية (تعويض عن عطل، عرض تجربة إضافي) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const { id } = await ctx.params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { amount?: number } | null;
  const amount = body?.amount;
  if (!amount || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "الكمية مطلوبة (رقم موجب لمنح، سالب لخصم)" }, { status: 400 });
  }

  const rows = await db.select().from(schema.alaaCustomers).where(eq(schema.alaaCustomers.id, customerId)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });

  const [updated] = await db.update(schema.alaaCustomers)
    .set({ creditsBalance: sql`${schema.alaaCustomers.creditsBalance} + ${amount}`, updatedAt: new Date().toISOString() })
    .where(eq(schema.alaaCustomers.id, customerId))
    .returning();

  return NextResponse.json({ customer: updated });
}
