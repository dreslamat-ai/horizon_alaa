import { NextRequest, NextResponse } from "next/server";
import { verifySsoToken } from "@/lib/auth/sso";
import { createSessionToken, getActiveStaffByEmail, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/session";

// مستخدم Frappe غير مسجَّل في horizon_staff (زي العميل صاحب الموقع نفسه)
// يوصله هنا بلا أي جلسة — التحويل النهائي لصفحة الدخول العادية، لا خطأ.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = await verifySsoToken(token);
  const loginUrl = new URL("/login", req.url);
  if (!email) return NextResponse.redirect(loginUrl);

  const session = await getActiveStaffByEmail(email);
  if (!session) return NextResponse.redirect(loginUrl);

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
  return res;
}
