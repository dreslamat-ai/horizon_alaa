import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { adjustCreditsManually } from "@/lib/credits";

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

  const updated = await adjustCreditsManually(customerId, amount, staff.id);
  if (!updated) return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });

  return NextResponse.json({ customer: updated });
}
