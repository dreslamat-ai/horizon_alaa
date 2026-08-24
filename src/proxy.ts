// ─── حماية المسارات + الأدوار ─────────────────────────────────────────────────
// كل مسار محمي بالافتراض إلا /login وواجهته البرمجية. مرحلة ٤: /settings
// (والـAPI الموازي) محمي إضافيًا بدور admin — موظف support يترفض فعليًا
// هنا (تحويل/٤٠٣)، لا بإخفاء الرابط في الواجهة فقط.
import { NextResponse, type NextRequest } from "next/server";
import { requireAnySession } from "@/lib/auth/session";

// ويبهوك تليجرام عام لكن محمي بسر التوقيع x-telegram-bot-api-secret-token داخل المسار نفسه
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/sso", "/api/widget-status", "/api/telegram/webhook"];
const ADMIN_ONLY_PREFIXES = ["/settings", "/api/settings"];
// أصول ثابتة من public/ (زي أفاتار ألاء) — عُرِف حيًا: كانت بتتحوّل لـ/login
// لأن matcher الأصلي استثنى _next/* بس، مش ملفات public/ نفسها.
const STATIC_FILE_RE = /\.(png|jpg|jpeg|svg|ico|webp|gif)$/;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some(p => pathname === p) ||
    pathname.startsWith("/_next") ||
    STATIC_FILE_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const session = await requireAnySession(req);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // لوحة الإعدادات لموظفي Horizon الإداريين حصرًا — جلسة المستأجر لا
  // تدخلها أبدًا مهما كانت (kind=customer لا يحمل role أصلًا).
  const needsAdmin = ADMIN_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAdmin && (session.kind !== "staff" || session.role !== "admin")) {
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
