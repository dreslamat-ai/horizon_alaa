import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { fetchInvoicePdf } from "@/lib/erp/invoicePdf";


// بروكسي تحميل PDF — لماذا لا رابط مباشر لـERPNext في رد النموذج: الموظف
// (مستخدم ألاء) لا حساب له على نظام العميل غالبًا، فرابط مباشر يوصله
// لصفحة تسجيل دخول ERPNext لا يملك بياناتها. ألاء نفسها (بحساب العميل
// المتصل به) تجلب الملف وتُمرّره — الموظف لا يحتاج أي جلسة على ERPNext.
export async function GET(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const customerId = Number(req.nextUrl.searchParams.get("customerId"));
  const doctype = req.nextUrl.searchParams.get("doctype") ?? "Sales Invoice";
  const name = req.nextUrl.searchParams.get("name");
  if (!customerId || !name) {
    return NextResponse.json({ error: "customerId وname مطلوبان" }, { status: 400 });
  }
  // نفس القائمة المسموحة في executeTool.ts — بروكسي PDF لا يجوز أن يفتح
  // مسارًا للمستندات المحجوبة صراحةً في المحادثة.
  const ALLOWED_DOCTYPES = new Set(["Sales Invoice", "Purchase Invoice", "Quotation"]);
  if (!ALLOWED_DOCTYPES.has(doctype)) {
    return NextResponse.json({ error: `تحميل PDF غير متاح لـ"${doctype}"` }, { status: 403 });
  }

  try {
    // المنطق الكامل (النموذج الافتراضي + كروم مع الرجوع) اتوحّد في
    // invoicePdf.ts — نفس المسار يخدم الويب وبوت تليجرام (اللي بيبعت الملف).
    const rawBuf = await fetchInvoicePdf(customerId, doctype, name);
    if (!rawBuf) {
      return NextResponse.json({ error: "تعذّر جلب الملف من Horizon ERP" }, { status: 502 });
    }
    const buf = new Uint8Array(rawBuf);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}
