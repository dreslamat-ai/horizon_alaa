import { NextRequest, NextResponse } from "next/server";
import { like } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifySsoToken } from "@/lib/auth/sso";
import {
  createSessionToken, createCustomerSessionToken, getActiveStaffByEmail,
  SESSION_COOKIE, CUSTOMER_COOKIE, SESSION_MAX_AGE_SEC,
} from "@/lib/auth/session";

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

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  } as const;
}

/**
 * مستأجر منصة Horizon-Saas: عميل ألاء الوحيد الذي يطابق موقعه.
 * المطابقة على المضيف (host) لا النص الخام — erpUrl مخزَّن بالبروتوكول
 * (https://mtc.horizonerp.cloud) وقد يحمل شرطة مائلة أخيرة.
 */
async function findCustomerBySite(site: string): Promise<typeof schema.alaaCustomers.$inferSelect | null> {
  const rows = await db.select().from(schema.alaaCustomers)
    .where(like(schema.alaaCustomers.erpUrl, `%${site}%`));
  const matches = rows.filter(c => {
    try { return new URL(c.erpUrl).host === site; } catch { return false; }
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const identity = await verifySsoToken(token);

  const loginUrl = absoluteUrl(req, "/login");
  if (!identity) return NextResponse.redirect(loginUrl);

  // الـsite المعتمد هو الموقَّع داخل التوكن حصرًا. باراميتر ?site= في
  // الرابط يُقبل فقط لعرض الواجهة عند موظف Horizon (توكن قديم الصيغة) —
  // لا يدخل أبدًا في قرار "أي عميل تصير هذه الجلسة".
  const signedSite = identity.site;
  const displaySite = signedSite ?? req.nextUrl.searchParams.get("site");

  const homeUrl = absoluteUrl(req, "/");
  if (displaySite) homeUrl.searchParams.set("site", displaySite);

  // موظف Horizon مسجَّل في horizon_staff — الأولوية له كما كانت دائمًا.
  const staff = await getActiveStaffByEmail(identity.email);
  if (staff) {
    const res = NextResponse.redirect(homeUrl);
    res.cookies.set(SESSION_COOKIE, await createSessionToken(staff), sessionCookieOptions());
    return res;
  }

  // مستخدم مستأجر: جلسة مقفولة على عميل موقعه هو — بشرط site موقَّع.
  if (signedSite) {
    const customer = await findCustomerBySite(signedSite);
    if (customer && customer.subscriptionStatus !== "suspended" && customer.subscriptionStatus !== "cancelled") {
      const res = NextResponse.redirect(homeUrl);
      res.cookies.set(
        CUSTOMER_COOKIE,
        await createCustomerSessionToken({ customerId: customer.id, email: identity.email, name: customer.companyNameAr }),
        sessionCookieOptions(),
      );
      return res;
    }
  }

  // لا موظف ولا عميل مطابق — صفحة الدخول العادية بلا أي جلسة ولا تسريب.
  return NextResponse.redirect(loginUrl);
}
