// ─── حماية المسارات + الأدوار ─────────────────────────────────────────────────
// كل مسار محمي بالافتراض إلا /login وواجهته البرمجية. مرحلة ٤: /settings
// (والـAPI الموازي) محمي إضافيًا بدور admin — موظف support يترفض فعليًا
// هنا (تحويل/٤٠٣)، لا بإخفاء الرابط في الواجهة فقط.
import { NextResponse, type NextRequest } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const ADMIN_ONLY_PREFIXES = ["/settings", "/api/settings"];

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

  const needsAdmin = ADMIN_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAdmin && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "هذا القسم لمديري ألاء فقط" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
