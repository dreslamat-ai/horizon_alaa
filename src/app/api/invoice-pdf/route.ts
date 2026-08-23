import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { getErpConfigForCustomer, getErpAuthHeader } from "@/lib/erp/erpConnection";

/**
 * النموذج الافتراضي للدوكتايب من Property Setter عند العميل — نفس المصدر
 * الذي تقرأ منه شاشة الطباعة في ERPNext. فشل الاستعلام لا يمنع التحميل
 * (يرجع null فيُستخدم Standard) — نموذج غير مثالي أفضل من لا ملف.
 */
async function resolveDefaultPrintFormat(
  baseUrl: string,
  auth: { header: string; value: string },
  doctype: string
): Promise<string | null> {
  try {
    const filters = encodeURIComponent(JSON.stringify([
      ["doc_type", "=", doctype],
      ["property", "=", "default_print_format"],
    ]));
    const res = await fetch(
      `${baseUrl}/api/resource/Property%20Setter?filters=${filters}&fields=${encodeURIComponent('["value"]')}&limit_page_length=1`,
      { headers: { [auth.header]: auth.value } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ value?: string }> };
    const value = data?.data?.[0]?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}

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
    const cfg = await getErpConfigForCustomer(customerId);
    const auth = await getErpAuthHeader(cfg);
    // نموذج الطباعة الافتراضي يُقرأ من نظام العميل نفسه (Property Setter
    // على الدوكتايب) لا يُثبَّت هنا — "Standard" الثابتة كانت بتتجاهل
    // النموذج المعتمد فعليًا عند العميل (بلاغ حي من المالك). لو ما فيش
    // افتراضي معرَّف يرجع "Standard" كما كان.
    const format = (await resolveDefaultPrintFormat(cfg.url, auth, doctype)) ?? "Standard";
    const qs = new URLSearchParams({ doctype, name, format, no_letterhead: "0" });
    // مولّد كروم (v16) يرندر النماذج المصمَّمة للمتصفح كما هي — wkhtmltopdf
    // كان يقصّ الأطراف ويُسقط خلفية الترويسة (مقيس ببروتوتايبات فعلية).
    // نسخة عميل أقدم لا تعرف الباراميتر ⇐ إعادة محاولة بدونه، لا فشل.
    qs.set("pdf_generator", "chrome");
    let res = await fetch(`${cfg.url}/api/method/frappe.utils.print_format.download_pdf?${qs}`, {
      headers: { [auth.header]: auth.value },
    });
    if (!res.ok) {
      qs.delete("pdf_generator");
      res = await fetch(`${cfg.url}/api/method/frappe.utils.print_format.download_pdf?${qs}`, {
        headers: { [auth.header]: auth.value },
      });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `تعذّر جلب الملف من ERPNext (${res.status})` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
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
