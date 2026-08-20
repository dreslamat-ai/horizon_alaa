import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { db, schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });
  // /api/settings/* محمي بدور admin أصلًا من proxy.ts — لا حاجة لتكرار الفحص هنا

  const rows = await db.select({
    id: schema.horizonStaff.id,
    email: schema.horizonStaff.email,
    name: schema.horizonStaff.name,
    role: schema.horizonStaff.role,
    isActive: schema.horizonStaff.isActive,
  }).from(schema.horizonStaff);

  return NextResponse.json({ staff: rows });
}

export async function POST(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    email?: string; name?: string; password?: string; role?: string;
  } | null;
  if (!body?.email || !body?.name || !body?.password) {
    return NextResponse.json({ error: "البريد والاسم وكلمة المرور مطلوبون" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٨ أحرف على الأقل" }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "support";

  const dup = (await db.select().from(schema.horizonStaff).where(eq(schema.horizonStaff.email, body.email)).limit(1))[0];
  if (dup) return NextResponse.json({ error: "فيه موظف بنفس البريد بالفعل" }, { status: 409 });

  const [newStaff] = await db.insert(schema.horizonStaff).values({
    email: body.email,
    name: body.name,
    passwordHash: await hashPassword(body.password),
    role,
  }).returning({ id: schema.horizonStaff.id, email: schema.horizonStaff.email, name: schema.horizonStaff.name, role: schema.horizonStaff.role });

  return NextResponse.json({ staff: newStaff });
}
