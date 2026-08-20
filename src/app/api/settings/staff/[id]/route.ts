import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const { id } = await ctx.params;
  const staffId = Number(id);
  if (!staffId) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { role?: string; isActive?: boolean } | null;
  if (!body) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  // موظف admin ميقدرش يعطّل نفسه أو يشيل صلاحيته الإدارية عن نفسه —
  // يقفل الوصول لآخر حساب إداري وميقدرش أحد يرجّعه.
  if (staffId === staff.id && (body.isActive === false || body.role === "support")) {
    return NextResponse.json({ error: "متقدرش تعطّل أو تنزّل صلاحية حسابك أنت نفسك" }, { status: 400 });
  }

  const update: Partial<typeof schema.horizonStaff.$inferInsert> = {};
  if (body.role === "admin" || body.role === "support") update.role = body.role;
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  const [updated] = await db.update(schema.horizonStaff).set(update).where(eq(schema.horizonStaff.id, staffId)).returning({
    id: schema.horizonStaff.id, email: schema.horizonStaff.email, name: schema.horizonStaff.name,
    role: schema.horizonStaff.role, isActive: schema.horizonStaff.isActive,
  });
  if (!updated) return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });

  return NextResponse.json({ staff: updated });
}
