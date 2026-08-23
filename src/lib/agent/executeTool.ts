// ─── منفّذ أدوات "ألاء" ──────────────────────────────────────────────────────
// نسخة مصغَّرة لمرحلة البروتوتايب — منقولة بتصرّف من
// almoaser-dev/server/agent/executeTool.ts (١٢٧٥ سطراً هناك، هنا فقط ما
// يقابل TOOLS في toolDefinitions.ts). لا بحث تقريبي معرَّب (findSimilar*)
// في هذه المرحلة — تحسين مؤجَّل لمرحلة لاحقة، ليس نسياناً.
import { erpGET, currentErpConfig } from "../erp/erpClient";
import { cachedErpCapabilities } from "../erp/erpPermissions";

/**
 * حجب صريح في الكود — دفاع مستقل عن صلاحيات حساب الاتصال في ERPNext.
 *
 * اكتُشف فعليًا (استعلام مباشر على tabHas Role، لا افتراض) أن حساب
 * الاختبار الحالي (mthgo103@gmail.com) يحمل أدوارًا أوسع بكثير من "موظف
 * محدود": Manufacturing Manager وStock User وManufacturing User —
 * ليست القراءة المحدودة المفترَضة في القرار القديم الموثَّق. صلاحيات
 * ERPNext نفسها هي الحاجز الأول (استعلام يتجاوزها يرجع PermissionError)،
 * لكن الاعتماد عليها وحدها خطأ: حساب لموظف Horizon مستقبلي قد يُمنح
 * صلاحيات أوسع لسبب عملي (تشغيل النظام)، وهذا لا يعني أن "ألاء" يجوز أن
 * تسرد بيانات رواتب وحسابات مستخدمين لموظف دعم يستعلم نيابةً عن عميل.
 * القائمة هنا **مستقلة تمامًا** عن أي صلاحية ERPNext — تُرفض دائمًا بغض
 * النظر عمّا يسمح به حساب الاتصال.
 */
const BLOCKED_DOCTYPES = new Set([
  "Salary Slip", "Salary Structure", "Salary Structure Assignment",
  "Salary Component", "Employee Advance", "Loan", "Loan Application",
  "User", "Role", "Role Profile", "User Permission",
  "Employee Tax Exemption Declaration", "Employee Tax Exemption Proof Submission",
]);

export async function executeTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown; display: string }> {
  switch (name) {
    case "list_documents": {
      const doctype = String(args.doctype ?? "").trim();
      if (!doctype) throw new Error("اسم DocType مطلوب");
      if (BLOCKED_DOCTYPES.has(doctype)) {
        return {
          result: { error: `القراءة من "${doctype}" غير متاحة لألاء — بيانات حساسة (رواتب/حسابات مستخدمين) خارج نطاقها دائمًا` },
          display: "",
        };
      }
      // list_documents ديناميكية (doctype من args)، فـnarrowToolsByErpPermissions
      // لا تقدر تمنعها مسبقًا — فحصها هنا وقت التنفيذ الفعلي، طبقة إرشادية
      // فقط: caps غائبة (لسه ما جُلبت) لا تمنع شيئًا، ERPNext نفسه هو الحاجز.
      const cfg = currentErpConfig();
      const caps = cachedErpCapabilities(cfg.url, cfg.username);
      if (caps && !caps.unrestricted && !caps.can(doctype, "read")) {
        return {
          result: { error: `صلاحيات حساب الاتصال بـ"${doctype}" لا تسمح بالقراءة (ERPNext)` },
          display: "",
        };
      }
      const fields = Array.isArray(args.fields) && args.fields.length
        ? (args.fields as string[]).map(String)
        : ["name"];
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const qs = new URLSearchParams({
        fields: JSON.stringify(fields),
        limit_page_length: String(limit),
      });
      if (args.filters && typeof args.filters === "object") {
        qs.set("filters", JSON.stringify(args.filters));
      }
      const res = await erpGET(`/api/resource/${encodeURIComponent(doctype)}?${qs}`) as { data?: unknown[] };
      const rows = res?.data ?? [];
      return { result: { doctype, count: rows.length, rows }, display: `${doctype}: ${rows.length} سجل` };
    }

    case "get_customers": {
      const limit = (args.limit as number) ?? 20;
      const fields = encodeURIComponent(JSON.stringify(["name", "customer_name", "customer_type", "mobile_no", "email_id"]));
      let path = `/api/resource/Customer?limit=${limit}&fields=${fields}`;
      if (args.search) path += `&filters=${encodeURIComponent(JSON.stringify([["customer_name", "like", `%${args.search}%`]]))}`;
      const data = await erpGET(path) as { data: unknown[] };
      return { result: data?.data ?? [], display: `عملاء: ${(data?.data ?? []).length}` };
    }

    case "get_items": {
      const limit = (args.limit as number) ?? 20;
      const fields = encodeURIComponent(JSON.stringify(["name", "item_name", "item_group", "standard_rate", "stock_uom"]));
      let path = `/api/resource/Item?limit=${limit}&fields=${fields}`;
      if (args.search) path += `&filters=${encodeURIComponent(JSON.stringify([["item_name", "like", `%${args.search}%`]]))}`;
      const data = await erpGET(path) as { data: unknown[] };
      return { result: data?.data ?? [], display: `أصناف: ${(data?.data ?? []).length}` };
    }

    case "get_invoices": {
      const limit = (args.limit as number) ?? 10;
      const fields = encodeURIComponent(JSON.stringify(["name", "customer", "posting_date", "due_date", "grand_total", "outstanding_amount", "status", "currency"]));
      let filterStr = "";
      if (args.status) filterStr = `&filters=${encodeURIComponent(JSON.stringify([["status", "=", args.status]]))}`;
      else if (args.customer) filterStr = `&filters=${encodeURIComponent(JSON.stringify([["customer", "like", `%${args.customer}%`]]))}`;
      const data = await erpGET(`/api/resource/Sales%20Invoice?limit=${limit}&fields=${fields}&order_by=posting_date%20desc${filterStr}`) as { data: unknown[] };
      return { result: data?.data ?? [], display: `فواتير: ${(data?.data ?? []).length}` };
    }

    case "get_invoice_detail": {
      const invName = encodeURIComponent(args.invoice_name as string);
      const data = await erpGET(`/api/resource/Sales%20Invoice/${invName}`) as { data: unknown };
      return { result: data?.data, display: `تفاصيل فاتورة ${args.invoice_name}` };
    }

    case "get_invoice_pdf_link": {
      const invoiceName = String(args.invoice_name ?? "").trim();
      if (!invoiceName) throw new Error("رقم الفاتورة مطلوب");
      // تأكيد الوجود أولاً — رابط لفاتورة غير موجودة يوصل المستخدم لصفحة
      // خطأ بلا تفسير، وoutcomeGuard لا يفحص روابط داخل النص العادي.
      await erpGET(`/api/resource/Sales%20Invoice/${encodeURIComponent(invoiceName)}`);
      const { customerId } = currentErpConfig();
      const qs = new URLSearchParams({ customerId: String(customerId), doctype: "Sales Invoice", name: invoiceName });
      // البادئة /alaa إلزامية: التطبيق مخدوم تحت basePath /alaa، والرابط
      // بدونها يقع على Frappe نفسه (بلاغ حي بلقطة شاشة ٢٣ أغسطس).
      return {
        result: { url: `/alaa/api/invoice-pdf?${qs}`, invoice_name: invoiceName },
        display: `رابط PDF لفاتورة ${invoiceName}`,
      };
    }

    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
