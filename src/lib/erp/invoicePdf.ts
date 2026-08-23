// ─── توليد PDF فاتورة — منطق مشترك بين مسار الويب وبوت تليجرام ───────────────
// طلب المالك (٢٤ أغسطس): البوت يبعت ملف الـPDF نفسه لا رابطًا — الرابط في
// تليجرام يتطلب جلسة ويب فلا ينفع. المنطق نفسه المستخدم في مسار
// /api/invoice-pdf: النموذج الافتراضي من نظام العميل + مولّد كروم مع
// رجوع تلقائي للمحرك القديم لو نسخة العميل لا تعرفه.
import { getErpConfigForCustomer, getErpAuthHeader } from "./erpConnection";

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
    return data?.data?.[0]?.value?.trim() || null;
  } catch {
    return null;
  }
}

export async function fetchInvoicePdf(
  customerId: number,
  doctype: string,
  name: string
): Promise<Buffer | null> {
  const cfg = await getErpConfigForCustomer(customerId);
  const auth = await getErpAuthHeader(cfg);
  const format = (await resolveDefaultPrintFormat(cfg.url, auth, doctype)) ?? "Standard";
  const qs = new URLSearchParams({ doctype, name, format, no_letterhead: "0" });
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
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
