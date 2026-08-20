import { NextRequest, NextResponse } from "next/server";
import { checkStaffCredentials, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "البريد وكلمة المرور مطلوبان" }, { status: 400 });
  }

  const session = await checkStaffCredentials(body.email, body.password);
  if (!session) {
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
  return res;
}
