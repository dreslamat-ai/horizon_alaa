import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { testErpConnection } from "@/lib/erp/erpConnection";

export async function POST(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { url?: string; username?: string; password?: string } | null;
  if (!body?.url || !body?.username || !body?.password) {
    return NextResponse.json({ ok: false, error: "الرابط واسم المستخدم وكلمة المرور مطلوبة" }, { status: 400 });
  }

  const result = await testErpConnection(body.url, body.username, body.password);
  return NextResponse.json(result);
}
