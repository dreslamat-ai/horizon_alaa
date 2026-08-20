// ─── حماية المسارات ──────────────────────────────────────────────────────────
// كل مسار محمي بالافتراض إلا /login وواجهته البرمجية — هذا هو الفحص الذي
// يثبت "تسجيل الدخول شرط حقيقي لا شكلي" (بند التحقق في خطة "ألاء" القسم ٩):
// محاولة وصول مباشرة بلا جلسة تُعاد توجيهها فعليًا هنا، لا تُخفى بصريًا فقط
// في المكوّن.
import { NextResponse, type NextRequest } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname === p) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const session = await requireStaffSession(req);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
