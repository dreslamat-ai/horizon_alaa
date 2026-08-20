import { NextRequest, NextResponse } from "next/server";
import { verifySsoToken } from "@/lib/auth/sso";
import { createSessionToken, getActiveStaffByEmail, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/session";

// مستخدم Frappe غير مسجَّل في horizon_staff (زي العميل صاحب الموقع نفسه)
// يوصله هنا بلا أي جلسة — التحويل النهائي لصفحة الدخول العادية، لا خطأ.
//
// عُطل حي (٢٠ أغسطس)، قيسناه بـ/api/debug-headers مؤقّت: في `next start`
// خلف nginx، req.url/req.nextUrl.origin بيتبنيا من عنوان الـsocket
// المحلي (127.0.0.1:4001) دايمًا — حتى لو هيدر Host/X-Forwarded-*
// واصل صح (وهو واصل فعلاً، اتأكّد بالقياس). المشكلة في Route Handler
// عادي (Node runtime) تحديدًا، لا middleware (Edge) — proxy.ts بيشتغل
// صح لأنه بيتعامل مع الهيدرز بطريقة مختلفة. الحل الوحيد الموثوق هنا:
// بناء الرابط يدويًا من x-forwarded-proto/host، مش من req.url إطلاقًا.
function absoluteUrl(req: NextRequest, path: string): URL {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return new URL(`/alaa${path}`, `${proto}://${host}`);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const site = req.nextUrl.searchParams.get("site");
  const email = await verifySsoToken(token);

  const loginUrl = absoluteUrl(req, "/login");
  if (!email) return NextResponse.redirect(loginUrl);

  const session = await getActiveStaffByEmail(email);
  if (!session) return NextResponse.redirect(loginUrl);

  // site معروف من مكان الفتح (زي e.horizonerp.cloud) — يُمرَّر للصفحة
  // الرئيسية عشان تختار العميل المطابق تلقائيًا بدل ما تسأل الموظف.
  const homeUrl = absoluteUrl(req, "/");
  if (site) homeUrl.searchParams.set("site", site);

  const res = NextResponse.redirect(homeUrl);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
  return res;
}
