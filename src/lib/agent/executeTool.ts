// ─── منفّذ أدوات "ألاء" ──────────────────────────────────────────────────────
// نسخة مصغَّرة لمرحلة البروتوتايب — منقولة بتصرّف من
// almoaser-dev/server/agent/executeTool.ts (١٢٧٥ سطراً هناك، هنا فقط ما
// يقابل TOOLS في toolDefinitions.ts). لا بحث تقريبي معرَّب (findSimilar*)
// في هذه المرحلة — تحسين مؤجَّل لمرحلة لاحقة، ليس نسياناً.
import { erpGET, erpPOST, erpPUT, erpDELETE, cancelDoc, currentErpConfig } from "../erp/erpClient";
import { normalizeArabic, isSimilar, translateErpError, findSimilarCustomers, findSimilarItems, findSimilarSuppliers, submitDoc, getDefaultCompany, resolveCompanyInfo, postDocWithCostCenterRetry, checkTaxIdForCompanyCountry, inspectTaxSetup, fetchCustomerAddress } from "../erp/writeHelpers";
import { inspectCustomerCompleteness, describeMissing, type CustomerDoc } from "../erp/customerCompleteness";
import { reviewDepartments, type Department } from "./departments";
import { resolvePrintFormatCandidates } from "./printFormats";
import { fetchCustomerAddressName, SINGLE_DOCTYPES } from "../erp/writeHelpers";

const FINANCIAL_DOCTYPES = new Set(["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"]);

import { cachedErpCapabilities } from "../erp/erpPermissions";

/**
 * حجب صريح في الكود — دفاع مستقل عن صلاحيات حساب الاتصال في Horizon ERP.
 *
 * اكتُشف فعليًا (استعلام مباشر على tabHas Role، لا افتراض) أن حساب
 * الاختبار الحالي (mthgo103@gmail.com) يحمل أدوارًا أوسع بكثير من "موظف
 * محدود": Manufacturing Manager وStock User وManufacturing User —
 * ليست القراءة المحدودة المفترَضة في القرار القديم الموثَّق. صلاحيات
 * Horizon ERP نفسها هي الحاجز الأول (استعلام يتجاوزها يرجع PermissionError)،
 * لكن الاعتماد عليها وحدها خطأ: حساب لموظف Horizon مستقبلي قد يُمنح
 * صلاحيات أوسع لسبب عملي (تشغيل النظام)، وهذا لا يعني أن "ألاء" يجوز أن
 * تسرد بيانات رواتب وحسابات مستخدمين لموظف دعم يستعلم نيابةً عن عميل.
 * القائمة هنا **مستقلة تمامًا** عن أي صلاحية Horizon ERP — تُرفض دائمًا بغض
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
      // فقط: caps غائبة (لسه ما جُلبت) لا تمنع شيئًا، Horizon ERP نفسه هو الحاجز.
      const cfg = currentErpConfig();
      const caps = cachedErpCapabilities(cfg.url, cfg.username);
      if (caps && !caps.unrestricted && !caps.can(doctype, "read")) {
        return {
          result: { error: `صلاحيات حساب الاتصال بـ"${doctype}" لا تسمح بالقراءة (Horizon ERP)` },
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

    // ─── أدوات التسجيل — منقولة حرفيًا من سارة (حوكمتها كما هي) ───
    case "get_doctype_fields": {
      // قبل إنشاء أي مستند: اقرئي حقوله الفعلية — قاعدة سارة "لا تخترع أسماء حقول"
      const dt = String(args.doctype ?? "").trim();
      if (!dt) throw new Error("اسم DocType مطلوب");
      if (BLOCKED_DOCTYPES.has(dt)) {
        return { result: { error: `هذا النوع (${dt}) محجوب دائمًا — بيانات أفراد حساسة` }, display: "" };
      }
      const meta = await erpGET(`/api/resource/DocType/${encodeURIComponent(dt)}`) as { data?: { istable?: number; is_submittable?: number; fields?: Array<{ fieldname: string; label?: string; fieldtype: string; reqd?: number; options?: string }> } };
      const all = meta?.data?.fields ?? [];
      const skip = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading"]);
      const brief = all.filter(f => !skip.has(f.fieldtype)).map(f => ({
        fieldname: f.fieldname, label: f.label, fieldtype: f.fieldtype,
        required: f.reqd === 1, ...(f.options && ["Link", "Select", "Table"].includes(f.fieldtype) ? { options: f.options } : {}),
      }));
      const required = brief.filter(f => f.required);
      return {
        result: { doctype: dt, is_submittable: meta?.data?.is_submittable === 1, required_fields: required, fields: brief.slice(0, 60) },
        display: `حقول ${dt}: ${required.length} إلزامي`,
      };
    }
    case "create_document": {
      // إنشاء عام لأي مستند تسمح به صلاحيات حساب الاتصال — Horizon ERP نفسه
      // يرفض ما لا يملك الحساب إنشاءه (403 تُنقل كما هي)، والمحجوب محجوب.
      const dt = String(args.doctype ?? "").trim();
      const values = args.values as Record<string, unknown>;
      if (!dt) throw new Error("اسم DocType مطلوب");
      if (BLOCKED_DOCTYPES.has(dt)) {
        return { result: { error: `هذا النوع (${dt}) محجوب دائمًا — بيانات أفراد حساسة` }, display: "" };
      }
      if (!values || Object.keys(values).length === 0) throw new Error("قيم المستند مطلوبة");
      delete (values as Record<string, unknown>).docstatus; // مسودة دائمًا — الاعتماد خطوة منفصلة
      const data = await erpPOST(`/api/resource/${encodeURIComponent(dt)}`, values) as { data?: { name?: string } };
      return {
        result: data?.data,
        display: `${dt} ${data?.data?.name ?? ""} أُنشئ مسودة`,
      };
    }

    case "create_invoice": {
      // حماية: تأكد من وجود العميل، وإن وُجد مشابه استخدمه تلقائياً
      const customerName = args.customer as string;
      const custMatches = await findSimilarCustomers(customerName);
      const exactCust = custMatches.find(c => normalizeArabic(c.customer_name) === normalizeArabic(customerName) || c.name === customerName);
      let resolvedCustomer = exactCust?.name ?? null;
      if (!resolvedCustomer && custMatches.length === 1) resolvedCustomer = custMatches[0].name;
      if (!resolvedCustomer && custMatches.length > 1) {
        return {
          result: { needs_clarification: true, reason: "found_multiple_customers", candidates: custMatches.map(c => c.customer_name) },
          display: "",
        };
      }
      if (!resolvedCustomer) {
        return {
          result: { error: `العميل "${customerName}" غير موجود في النظام. أنشئه أولاً بـ create_customer ثم أعد إنشاء الفاتورة` },
          display: "",
        };
      }
      // حماية: الفاتورة الضريبية تتطلب رقماً ضريبياً مسجلاً للعميل من نوع شركة/مؤسسة —
      // امنع إنشاء الفاتورة وأعد needs_clarification بدل إنشائها ناقصة
      try {
        const custDoc = await erpGET(`/api/resource/Customer/${encodeURIComponent(resolvedCustomer)}`) as { data: CustomerDoc };
        const address = await fetchCustomerAddress(resolvedCustomer, custDoc?.data?.customer_primary_address ?? null);
        const completeness = inspectCustomerCompleteness(custDoc?.data ?? {}, address);
        if (!completeness.complete) {
          return {
            result: {
              needs_clarification: true,
              reason: "customer_data_incomplete",
              customer: resolvedCustomer,
              customer_name: custDoc?.data?.customer_name ?? resolvedCustomer,
              missing: completeness.missing,
              missing_ar: describeMissing(completeness.missing),
              message: `لا يمكن إصدار فاتورة ضريبية لهذا العميل قبل استكمال: ${describeMissing(completeness.missing)}. اطلب هذه البيانات من المستخدم ثم سجّلها بـ update_customer، ولا تُصدر الفاتورة قبل ذلك`,
            },
            display: "",
          };
        }
        if (completeness.warnings.length) {
          console.info("[create_invoice] بيانات ناقصة غير مانعة:", completeness.warnings.join(","));
        }
      } catch (e) {
        console.warn("[create_invoice] customer completeness check failed:", e instanceof Error ? e.message : e);
      }
      // حماية: حل أكواد الأصناف — استخدم الموجود إن وُجد مشابه
      const rawItems = args.items as Array<{ item_code: string; qty: number; rate: number }>;
      const resolvedItems: Array<{ item_code: string; qty: number; rate: number }> = [];
      for (const it of rawItems) {
        const itemMatches = await findSimilarItems(it.item_code);
        const exactItem = itemMatches.find(i => normalizeArabic(i.item_name) === normalizeArabic(it.item_code) || i.name === it.item_code);
        const resolved = exactItem?.name ?? (itemMatches.length === 1 ? itemMatches[0].name : null);
        if (!resolved) {
          if (itemMatches.length > 1) {
            return {
              result: { needs_clarification: true, reason: "found_multiple_items", searched: it.item_code, candidates: itemMatches.map(i => i.item_name) },
              display: "",
            };
          }
          return {
            result: { error: `الصنف "${it.item_code}" غير موجود في النظام. أنشئه أولاً بـ create_item ثم أعد إنشاء الفاتورة` },
            display: "",
          };
        }
        resolvedItems.push({ item_code: resolved, qty: it.qty, rate: it.rate });
      }
      const today = new Date().toISOString().split("T")[0];
      // due_date لا يجوز أن يسبق posting_date — إن كان التاريخ المُمرر أقدم (مثلاً من صورة فاتورة قديمة) استخدم اليوم
      // الحارس القديم كان مقارنة نصية تفترض ISO — صيغة غلط من الموديل
      // (24-08-2026 مثلًا) كانت تعدّي وتفشّل الإنشاء عند Horizon ERP (مقيس حيًّا)
      const requestedDue = (args.due_date as string) ?? today;
      const isIso = /^\d{4}-\d{2}-\d{2}$/.test(requestedDue);
      const safeDueDate = !isIso || requestedDue < today ? today : requestedDue;
      // ─── ضريبة القيمة المضافة: تُطبَّق من قوالب الضرائب الجاهزة في نظام المعاصر ───
      // نجلب القالب الافتراضي (أو الأول المتاح) من Sales Taxes and Charges Template دون أي إعداد يدوي من الوكيل
      const applyVat = (args.apply_vat as boolean) ?? true;
      let taxTemplate: string | null = null;
      let taxRows: Array<Record<string, unknown>> = [];
      if (applyVat) {
        // لا نُصدر فاتورة ضريبية بصمت بدون ضريبة: إن لم تكن إعدادات الضريبة مضبوطة
        // نوقف الإنشاء ونطلب من الوكيل إبلاغ العميل وأخذ موافقته على ضبطها
        const taxSetup = await inspectTaxSetup();
        if (!taxSetup.ok) {
          return { result: { needs_clarification: true, reason: "tax_settings_not_configured", ...taxSetup }, display: "" };
        }
        taxTemplate = taxSetup.template;
        taxRows = taxSetup.taxRows;
      }
      const company = await resolveCompanyInfo();
      const invoiceDoc = {
        ...(company ? { company: company.name } : {}),
        customer: resolvedCustomer,
        posting_date: today,
        due_date: safeDueDate,
        items: resolvedItems.map(i => ({
          item_code: i.item_code,
          qty: i.qty,
          rate: i.rate,
          amount: i.qty * i.rate,
        })),
        ...(taxTemplate && taxRows.length > 0 ? { taxes_and_charges: taxTemplate, taxes: taxRows } : {}),
      };
      const data = await postDocWithCostCenterRetry("/api/resource/Sales%20Invoice", invoiceDoc, company) as { data: { name: string; grand_total: number; total_taxes_and_charges?: number; net_total?: number } };
      const invoiceName = data?.data?.name ?? "SINV-???";


      return {
        result: data?.data,
        display: `فاتورة ${invoiceName} أُنشئت مسودة`,
      };
    }
    case "create_customer": {
      // تحقق من صيغة الرقم الضريبي قبل تخزينه — لا نُخزّن رقماً مستحيلاً أو مفبركاً
      if (args.tax_id) {
        const check = await checkTaxIdForCompanyCountry(String(args.tax_id));
        if (!check.valid) {
          return { result: { needs_clarification: true, reason: "invalid_tax_id", provided: String(args.tax_id), problem: check.reason, message: "الرقم الضريبي الذي أعطاه العميل غير صحيح الصيغة — أبلغه بالمشكلة واطلب الرقم الصحيح" }, display: "" };
        }
        args.tax_id = check.normalized;
      }
      // منع التكرار: ابحث عن عميل مطابق أو مشابه أولاً
      const newName = args.customer_name as string;
      const existing = await findSimilarCustomers(newName);
      if (existing.length > 0) {
        return {
          result: {
            duplicate_prevented: true,
            message: `يوجد ${existing.length} عميل مشابه بالفعل — استخدم الموجود بدلاً من الإنشاء`,
            candidates: existing.map(c => ({ name: c.name, customer_name: c.customer_name })),
          },
          display: "",
        };
      }
      // جلب المجموعة والإقليم الجذر ديناميكياً (قد تكون أسماؤها معرّبة)
      const cgData = await erpGET(`/api/resource/Customer%20Group?limit=1&filters=${encodeURIComponent(JSON.stringify([["is_group", "=", 1]]))}`) as { data: Array<{ name: string }> };
      const terData = await erpGET(`/api/resource/Territory?limit=1&filters=${encodeURIComponent(JSON.stringify([["is_group", "=", 1]]))}`) as { data: Array<{ name: string }> };
      const customerDoc = {
        customer_name: args.customer_name,
        customer_type: (args.customer_type as string) ?? "Company",
        customer_group: cgData?.data?.[0]?.name ?? "All Customer Groups",
        territory: terData?.data?.[0]?.name ?? "All Territories",
        ...(args.mobile_no ? { mobile_no: args.mobile_no } : {}),
        ...(args.email_id ? { email_id: args.email_id } : {}),
        ...(args.tax_id ? { tax_id: args.tax_id } : {}),
      };
      const data = await erpPOST("/api/resource/Customer", customerDoc) as { data: { name: string; customer_name: string; customer_type: string; tax_id?: string } };
      return {
        result: data?.data,
        display: `عميل جديد أُنشئ`,
      };
    }
    case "create_item": {
      // منع التكرار: ابحث عن صنف مطابق أو مشابه أولاً
      const newItemName = args.item_name as string;
      const existingItems = await findSimilarItems(newItemName);
      if (existingItems.length > 0) {
        return {
          result: {
            duplicate_prevented: true,
            message: `يوجد ${existingItems.length} صنف مشابه بالفعل — استخدم الموجود بدلاً من الإنشاء`,
            candidates: existingItems.map(i => ({ name: i.name, item_name: i.item_name, standard_rate: i.standard_rate })),
          },
          display: "",
        };
      }
      const isService = (args.is_service as boolean) ?? true;
      // جلب مجموعة الأصناف الجذر ووحدة القياس ديناميكياً
      const igData = await erpGET(`/api/resource/Item%20Group?limit=1&filters=${encodeURIComponent(JSON.stringify([["is_group", "=", 1]]))}`) as { data: Array<{ name: string }> };
      const uomData = await erpGET(`/api/resource/UOM?limit=1`) as { data: Array<{ name: string }> };
      const itemDoc = {
        item_code: (args.item_code as string) ?? (args.item_name as string),
        item_name: args.item_name,
        item_group: (args.item_group as string) ?? igData?.data?.[0]?.name ?? "All Item Groups",
        stock_uom: uomData?.data?.[0]?.name ?? "Nos",
        is_stock_item: isService ? 0 : 1,
        ...(args.standard_rate ? { standard_rate: args.standard_rate } : {}),
      };
      const data = await erpPOST("/api/resource/Item", itemDoc) as { data: { name: string; item_name: string; standard_rate: number; is_stock_item: number } };
      return {
        result: data?.data,
        display: `صنف جديد أُنشئ`,
      };
    }
    case "create_payment_entry": {
      const paymentType = args.payment_type as string; // Receive | Pay
      const partyName = args.party as string;
      const amount = args.amount as number;
      const partyType = paymentType === "Receive" ? "Customer" : "Supplier";
      // حل اسم الطرف
      let resolvedParty: string | null = null;
      if (partyType === "Customer") {
        const matches = await findSimilarCustomers(partyName);
        const exact = matches.find(c => normalizeArabic(c.customer_name) === normalizeArabic(partyName) || c.name === partyName);
        resolvedParty = exact?.name ?? (matches.length === 1 ? matches[0].name : null);
        if (!resolvedParty && matches.length > 1) {
          return { result: { needs_clarification: true, reason: "found_multiple_customers", candidates: matches.map(c => c.customer_name) }, display: "" };
        }
      } else {
        const matches = await findSimilarSuppliers(partyName);
        const exact = matches.find(s => normalizeArabic(s.supplier_name) === normalizeArabic(partyName) || s.name === partyName);
        resolvedParty = exact?.name ?? (matches.length === 1 ? matches[0].name : null);
        if (!resolvedParty && matches.length > 1) {
          return { result: { needs_clarification: true, reason: "found_multiple_suppliers", candidates: matches.map(s => s.supplier_name) }, display: "" };
        }
      }
      if (!resolvedParty) {
        return { result: { error: `${partyType === "Customer" ? "العميل" : "المورد"} "${partyName}" غير موجود في النظام` }, display: "" };
      }
      // استخدام الطريقة القياسية في Frappe لتجهيز دفعة مرتبطة بفاتورة
      const company = await getDefaultCompany();
      const today = new Date().toISOString().split("T")[0];
      const paymentDoc: Record<string, unknown> = {
        payment_type: paymentType,
        party_type: partyType,
        party: resolvedParty,
        company,
        posting_date: today,
        paid_amount: amount,
        received_amount: amount,
      };
      // حل طريقة الدفع بمطابقة ذكية مع طرق الدفع الفعلية في النظام
      if (args.mode_of_payment) {
        const requested = String(args.mode_of_payment);
        const mopData = await erpGET(`/api/resource/Mode%20of%20Payment?fields=${encodeURIComponent(JSON.stringify(["name"]))}&filters=${encodeURIComponent(JSON.stringify([["enabled", "=", 1]]))}`) as { data: Array<{ name: string }> };
        const mops = (mopData?.data ?? []).map(m => m.name);
        // مطابقة مباشرة أو تقريبية أو ترجمة إنجليزي→عربي شائعة
        const EN_AR: Record<string, string[]> = {
          cash: ["نقد", "نقدي", "كاش"],
          "bank transfer": ["حوالة مصرفية", "تحويل بنكي", "حوالة"],
          "wire transfer": ["حوالة مصرفية", "تحويل بنكي"],
          cheque: ["شيك"],
          check: ["شيك"],
          "credit card": ["بطاقة ائتمان", "بطاقة"],
          card: ["بطاقة ائتمان", "بطاقة"],
          "bank draft": ["مسودة بنكية"],
        };
        const norm = (s: string) => normalizeArabic(s.trim().toLowerCase());
        let resolvedMop = mops.find(m => norm(m) === norm(requested))
          ?? mops.find(m => norm(m).includes(norm(requested)) || norm(requested).includes(norm(m)));
        if (!resolvedMop) {
          const aliases = EN_AR[requested.trim().toLowerCase()] ?? [];
          resolvedMop = mops.find(m => aliases.some(a => norm(m) === norm(a) || norm(m).includes(norm(a))));
        }
        if (resolvedMop) {
          paymentDoc.mode_of_payment = resolvedMop;
        } else if (mops.length) {
          return { result: { needs_clarification: true, reason: "mode_of_payment_not_found", requested, available_modes: mops, hint: "اختر إحدى طرق الدفع المتاحة في النظام" }, display: "" };
        }
        // إن لم توجد أي طرق دفع معرفة، نتجاهل الحقل ونكمل بالحسابات الافتراضية
      }
      // جلب الحسابات الافتراضية: حساب الطرف (مدينون/دائنون) وحساب النقد
      const companyData = await erpGET(`/api/resource/Company/${encodeURIComponent(company)}`) as { data: { default_receivable_account?: string; default_payable_account?: string; default_cash_account?: string; default_bank_account?: string } };
      const cd = companyData?.data ?? {};
      const cashAccount = cd.default_cash_account || cd.default_bank_account;
      if (paymentType === "Receive") {
        paymentDoc.paid_from = cd.default_receivable_account;
        paymentDoc.paid_to = cashAccount;
      } else {
        paymentDoc.paid_from = cashAccount;
        paymentDoc.paid_to = cd.default_payable_account;
      }
      if (!paymentDoc.paid_from || !paymentDoc.paid_to) {
        return { result: { error: "الحسابات الافتراضية (النقد/المدينون/الدائنون) غير معرّفة في إعدادات الشركة داخل النظام — يرجى ضبطها أولاً" }, display: "" };
      }
      // ربط بفاتورة محددة إن طُلب
      if (args.reference_invoice) {
        const refDoctype = paymentType === "Receive" ? "Sales Invoice" : "Purchase Invoice";
        paymentDoc.references = [{
          reference_doctype: refDoctype,
          reference_name: args.reference_invoice,
          allocated_amount: amount,
        }];
      }
      const data = await erpPOST("/api/resource/Payment%20Entry", paymentDoc) as { data: { name: string; paid_amount: number; payment_type: string; party: string } };
      return {
        result: data?.data,
        display: `سند دفع أُنشئ مسودة`,
      };
    }
    case "submit_document": {
      const doctype = args.doctype as string;
      const docName = args.document_name as string;
      const result = await submitDoc(doctype, docName);
      return {
        result,
        display: `اعتُمد ${docName}`,
      };
    }

    // ─── إضافات من اقتراح المساعد فوق عدة سارة ───
    case "get_receivables_aging": {
      // اقتراح إضافي فوق عدة سارة: أعمار ديون العملاء — أهم سؤال تحصيل
      const f = encodeURIComponent(JSON.stringify([["docstatus", "=", 1], ["outstanding_amount", ">", 0]]));
      const flds = encodeURIComponent(JSON.stringify(["name", "customer", "posting_date", "due_date", "outstanding_amount", "currency"]));
      const data = await erpGET(`/api/resource/Sales Invoice?filters=${f}&fields=${flds}&limit_page_length=200&order_by=due_date asc`) as { data?: Array<{ customer: string; due_date?: string; outstanding_amount: number }> };
      const today = new Date().toISOString().split("T")[0];
      const buckets: Record<string, { current: number; d30: number; d60: number; d90: number; older: number; total: number }> = {};
      for (const r of data?.data ?? []) {
        const b = buckets[r.customer] ??= { current: 0, d30: 0, d60: 0, d90: 0, older: 0, total: 0 };
        const days = r.due_date ? Math.floor((Date.parse(today) - Date.parse(r.due_date)) / 864e5) : 0;
        const amt = r.outstanding_amount ?? 0;
        if (days <= 0) b.current += amt; else if (days <= 30) b.d30 += amt; else if (days <= 60) b.d60 += amt; else if (days <= 90) b.d90 += amt; else b.older += amt;
        b.total += amt;
      }
      const rows = Object.entries(buckets).map(([customer, b]) => ({ customer, ...b })).sort((a, z) => z.total - a.total);
      return { result: { as_of: today, customers: rows, grand_total: rows.reduce((t, r) => t + r.total, 0) }, display: `أعمار الديون: ${rows.length} عميل` };
    }
    case "get_low_stock": {
      // اقتراح إضافي: أصناف مخزونها فعليًا تحت حد إعادة الطلب أو قربت تخلص
      const flds = encodeURIComponent(JSON.stringify(["item_code", "warehouse", "actual_qty"]));
      const data = await erpGET(`/api/resource/Bin?fields=${flds}&limit_page_length=500&order_by=actual_qty asc`) as { data?: Array<{ item_code: string; warehouse: string; actual_qty: number }> };
      const threshold = Number(args.threshold ?? 10);
      const low = (data?.data ?? []).filter(b => (b.actual_qty ?? 0) <= threshold);
      return { result: { threshold, items: low.slice(0, 50) }, display: `مخزون منخفض: ${low.length} صنف/مخزن` };
    }
    case "compare_sales_periods": {
      // اقتراح إضافي: مقارنة مبيعات فترتين (الشهر الحالي × السابق افتراضيًا)
      const now = new Date();
      const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const thisStart = `${ym(now)}-01`;
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevStart = `${ym(prev)}-01`;
      async function totalBetween(from: string, to: string): Promise<{ count: number; total: number }> {
        const f = encodeURIComponent(JSON.stringify([["docstatus", "=", 1], ["posting_date", ">=", from], ["posting_date", "<", to]]));
        const flds = encodeURIComponent(JSON.stringify(["grand_total"]));
        const d = await erpGET(`/api/resource/Sales Invoice?filters=${f}&fields=${flds}&limit_page_length=500`) as { data?: Array<{ grand_total: number }> };
        const rows = d?.data ?? [];
        return { count: rows.length, total: rows.reduce((t, r) => t + (r.grand_total ?? 0), 0) };
      }
      const cur = await totalBetween(thisStart, new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0]);
      const pre = await totalBetween(prevStart, thisStart);
      const change = pre.total > 0 ? Math.round(((cur.total - pre.total) / pre.total) * 100) : null;
      return { result: { current_month: { from: thisStart, ...cur }, previous_month: { from: prevStart, ...pre }, change_percent: change }, display: "مقارنة مبيعات الشهرين" };
    }

    // ─── بقية عدة سارة كاملة (بطلب المالك: كل المهارات) ───
    case "get_suppliers": {
      const limit = (args.limit as number) ?? 20;
      const fields = encodeURIComponent(JSON.stringify(["name", "supplier_name", "supplier_type", "mobile_no", "email_id"]));
      let path = `/api/resource/Supplier?limit=${limit}&fields=${fields}`;
      if (args.search) path += `&filters=${encodeURIComponent(JSON.stringify([["supplier_name", "like", `%${args.search}%`]]))}`;
      const data = await erpGET(path) as { data: unknown[] };
      if (args.search && (!data?.data || data.data.length === 0)) {
        const similar = await findSimilarSuppliers(args.search as string);
        if (similar.length > 0) return { result: similar, display: "" };
      }
      return { result: data?.data ?? [], display: "" };
    }
    case "create_supplier": {
      const newName = args.supplier_name as string;
      const existing = await findSimilarSuppliers(newName);
      if (existing.length > 0) {
        return {
          result: {
            duplicate_prevented: true,
            message: `يوجد ${existing.length} مورد مشابه بالفعل — استخدم الموجود بدلاً من الإنشاء`,
            candidates: existing.map(s => ({ name: s.name, supplier_name: s.supplier_name })),
          },
          display: "",
        };
      }
      const sgData = await erpGET(`/api/resource/Supplier%20Group?limit=1&filters=${encodeURIComponent(JSON.stringify([["is_group", "=", 1]]))}`) as { data: Array<{ name: string }> };
      const supplierDoc = {
        supplier_name: newName,
        supplier_type: (args.supplier_type as string) ?? "Company",
        supplier_group: sgData?.data?.[0]?.name ?? "All Supplier Groups",
        ...(args.mobile_no ? { mobile_no: args.mobile_no } : {}),
        ...(args.email_id ? { email_id: args.email_id } : {}),
      };
      const data = await erpPOST("/api/resource/Supplier", supplierDoc) as { data: { name: string; supplier_name: string; supplier_type: string } };
      return {
        result: data?.data,
        display: "",
      };
    }
    case "get_purchase_invoices": {
      const limit = (args.limit as number) ?? 10;
      const fields = encodeURIComponent(JSON.stringify(["name", "supplier", "posting_date", "due_date", "grand_total", "outstanding_amount", "status", "currency"]));
      let filterStr = "";
      if (args.status) filterStr = `&filters=${encodeURIComponent(JSON.stringify([["status", "=", args.status]]))}`;
      else if (args.supplier) filterStr = `&filters=${encodeURIComponent(JSON.stringify([["supplier", "like", `%${args.supplier}%`]]))}`;
      const data = await erpGET(`/api/resource/Purchase%20Invoice?limit=${limit}&fields=${fields}&order_by=posting_date%20desc${filterStr}`) as { data: unknown[] };
      return { result: data?.data ?? [], display: "" };
    }
    case "create_purchase_invoice": {
      const supplierName = args.supplier as string;
      const supMatches = await findSimilarSuppliers(supplierName);
      const exactSup = supMatches.find(s => normalizeArabic(s.supplier_name) === normalizeArabic(supplierName) || s.name === supplierName);
      let resolvedSupplier = exactSup?.name ?? null;
      if (!resolvedSupplier && supMatches.length === 1) resolvedSupplier = supMatches[0].name;
      if (!resolvedSupplier && supMatches.length > 1) {
        return {
          result: { needs_clarification: true, reason: "found_multiple_suppliers", candidates: supMatches.map(s => s.supplier_name) },
          display: "",
        };
      }
      if (!resolvedSupplier) {
        return {
          result: { error: `المورد "${supplierName}" غير موجود في النظام. أنشئه أولاً بـ create_supplier ثم أعد إنشاء الفاتورة` },
          display: "",
        };
      }
      const rawItems = args.items as Array<{ item_code: string; qty: number; rate: number }>;
      const resolvedItems: Array<{ item_code: string; qty: number; rate: number }> = [];
      for (const it of rawItems) {
        const itemMatches = await findSimilarItems(it.item_code);
        const exactItem = itemMatches.find(i => normalizeArabic(i.item_name) === normalizeArabic(it.item_code) || i.name === it.item_code);
        const resolved = exactItem?.name ?? (itemMatches.length === 1 ? itemMatches[0].name : null);
        if (!resolved) {
          if (itemMatches.length > 1) {
            return {
              result: { needs_clarification: true, reason: "found_multiple_items", searched: it.item_code, candidates: itemMatches.map(i => i.item_name) },
              display: "",
            };
          }
          return {
            result: { error: `الصنف "${it.item_code}" غير موجود. أنشئه أولاً بـ create_item ثم أعد إنشاء فاتورة المشتريات` },
            display: "",
          };
        }
        resolvedItems.push({ item_code: resolved, qty: it.qty, rate: it.rate });
      }
      const today = new Date().toISOString().split("T")[0];
      const requestedPiDue = (args.due_date as string) ?? today;
      const safePiDueDate = requestedPiDue < today ? today : requestedPiDue;
      const piCompany = await resolveCompanyInfo();
      const piDoc = {
        ...(piCompany ? { company: piCompany.name } : {}),
        supplier: resolvedSupplier,
        posting_date: today,
        due_date: safePiDueDate,
        items: resolvedItems.map(i => ({ item_code: i.item_code, qty: i.qty, rate: i.rate, amount: i.qty * i.rate })),
      };
      const data = await postDocWithCostCenterRetry("/api/resource/Purchase%20Invoice", piDoc, piCompany) as { data: { name: string; grand_total: number } };
      return {
        result: data?.data,
        display: "",
      };
    }
    case "get_payments": {
      const limit = (args.limit as number) ?? 10;
      const fields = encodeURIComponent(JSON.stringify(["name", "payment_type", "party_type", "party", "paid_amount", "posting_date", "status", "mode_of_payment"]));
      const filters: Array<[string, string, string]> = [];
      if (args.payment_type) filters.push(["payment_type", "=", args.payment_type as string]);
      if (args.party) filters.push(["party", "like", `%${args.party}%`]);
      const filterStr = filters.length > 0 ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : "";
      const data = await erpGET(`/api/resource/Payment%20Entry?limit=${limit}&fields=${fields}&order_by=posting_date%20desc${filterStr}`) as { data: unknown[] };
      return { result: data?.data ?? [], display: "" };
    }
    case "get_accounts": {
      const fields = encodeURIComponent(JSON.stringify(["name", "account_name", "account_type", "root_type", "is_group"]));
      const filters: Array<[string, string, string | number]> = [["is_group", "=", 0]];
      if (args.search) filters.push(["account_name", "like", `%${args.search}%`]);
      if (args.root_type) filters.push(["root_type", "=", args.root_type as string]);
      const data = await erpGET(`/api/resource/Account?limit=50&fields=${fields}&filters=${encodeURIComponent(JSON.stringify(filters))}`) as { data: unknown[] };
      return { result: data?.data ?? [], display: "" };
    }
    case "get_journal_entries": {
      const limit = (args.limit as number) ?? 10;
      const fields = encodeURIComponent(JSON.stringify(["name", "posting_date", "total_debit", "total_credit", "user_remark", "docstatus"]));
      const data = await erpGET(`/api/resource/Journal%20Entry?limit=${limit}&fields=${fields}&order_by=posting_date%20desc`) as { data: unknown[] };
      return { result: data?.data ?? [], display: "" };
    }
    case "create_journal_entry": {
      const entries = args.entries as Array<{ account: string; debit: number; credit: number }>;
      const totalDebit = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
      const totalCredit = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return { result: { error: `القيد غير متوازن: إجمالي المدين ${totalDebit} ≠ إجمالي الدائن ${totalCredit} — يجب أن يتساويا` }, display: "" };
      }
      // حل أسماء الحسابات: بحث تقريبي عن كل حساب
      const resolvedEntries: Array<{ account: string; debit_in_account_currency: number; credit_in_account_currency: number }> = [];
      for (const e of entries) {
        const accFields = encodeURIComponent(JSON.stringify(["name", "account_name"]));
        const accFilters = encodeURIComponent(JSON.stringify([["is_group", "=", 0], ["account_name", "like", `%${e.account.trim().split(/\s+/)[0]}%`]]));
        const accData = await erpGET(`/api/resource/Account?limit=20&fields=${accFields}&filters=${accFilters}`) as { data: Array<{ name: string; account_name: string }> };
        const candidates = (accData?.data ?? []).filter(a => isSimilar(a.account_name, e.account) || isSimilar(a.name, e.account));
        // إذا كان الاسم الكامل (name) مطابقاً تماماً استخدمه مباشرة
        let resolvedAccount = e.account;
        if (candidates.length === 1) resolvedAccount = candidates[0].name;
        else if (candidates.length > 1) {
          const exact = candidates.find(a => normalizeArabic(a.account_name) === normalizeArabic(e.account));
          if (exact) resolvedAccount = exact.name;
          else return { result: { needs_clarification: true, reason: "found_multiple_accounts", searched: e.account, candidates: candidates.map(a => a.name) }, display: "" };
        } else if (candidates.length === 0) {
          // ربما مرر المستخدم الاسم الكامل بالفعل — جرّبه كما هو، وإلا سيُعاد خطأ مترجم
          resolvedAccount = e.account;
        }
        resolvedEntries.push({ account: resolvedAccount, debit_in_account_currency: e.debit ?? 0, credit_in_account_currency: e.credit ?? 0 });
      }
      const company = await getDefaultCompany();
      const jeDoc = {
        voucher_type: "Journal Entry",
        company,
        posting_date: (args.posting_date as string) ?? new Date().toISOString().split("T")[0],
        accounts: resolvedEntries,
        ...(args.remark ? { user_remark: args.remark } : {}),
      };
      const data = await erpPOST("/api/resource/Journal%20Entry", jeDoc) as { data: { name: string; total_debit: number } };
      return {
        result: data?.data,
        display: "",
      };
    }
    case "update_document": {
      const doctype = args.doctype as string;
      const docName = args.document_name as string;
      const fields = args.fields as Record<string, unknown>;
      if (!fields || Object.keys(fields).length === 0) throw new Error("لم تُحدَّد حقول للتعديل");
      const path = `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docName)}`;
      // منع تعديل مستند معتمد (docstatus=1) للمستندات المحاسبية
      const transactional = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"];
      if (transactional.includes(doctype)) {
        const cur = await erpGET(path) as { data?: { docstatus?: number } };
        if (cur?.data?.docstatus === 1) {
          throw new Error(`المستند ${docName} معتمد ولا يمكن تعديله مباشرة — يجب إلغاؤه أولاً (cancel_document) ثم إنشاء مستند بديل بالبيانات الصحيحة`);
        }
        if (cur?.data?.docstatus === 2) {
          throw new Error(`المستند ${docName} ملغى ولا يمكن تعديله`);
        }
      }
      const data = await erpPUT(path, fields) as { data: { name: string } };
      return {
        result: data?.data,
        display: "",
      };
    }
    case "cancel_document": {
      const doctype = args.doctype as string;
      const docName = args.document_name as string;
      const result = await cancelDoc(doctype, docName);
      return {
        result,
        display: "",
      };
    }
    case "delete_document": {
      const doctype = args.doctype as string;
      const docName = args.document_name as string;
      const path = `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docName)}`;
      // الإلغاء قبل الحذف لأي نوع لا لأربعة أنواع: إشعار التسليم وأمر البيع
      // يُعتمدان أيضاً، وقصرُ الفحص على المستندات المالية كان يجعل الحذف يفشل
      // عندها برسالة عامة. والملغى أصلاً (docstatus=2) يُحذف مباشرة بلا إلغاء.
      let wasCancelled = false;
      let currentStatus: number | undefined;
      try {
        const cur = await erpGET(path) as { data?: { docstatus?: number } };
        currentStatus = cur?.data?.docstatus;
      } catch { /* غير موجود — سيفشل الحذف برسالة واضحة */ }

      if (currentStatus === 1) {
        try {
          await cancelDoc(doctype, docName);
          wasCancelled = true;
        } catch (e) {
          // كان يُبتلع بصمت فيمضي الحذف ليفشل بـ"يجب الإلغاء أولاً" — رسالةٌ
          // تصف العَرَض وتخفي السبب. سبب تعذّر الإلغاء هو ما يحتاجه المستخدم.
          return { result: {
            error: `تعذّر إلغاء ${doctype} "${docName}" قبل حذفه: ${translateErpError(e instanceof Error ? e.message : String(e))}`,
            hint: "الإلغاء شرط الحذف لأي مستند معتمد — عالج سبب تعذّره أولاً",
          }, display: "" };
        }
      }

      try {
        await erpDELETE(path);
      } catch (e) {
        // Frappe يسمّي المستند المانع داخل رابط في رسالة الخطأ:
        // /app/Form/Delivery Note/MAT-DN-2024-00001 — استخراجه يعطي الوكيل
        // الهدف التالي مباشرةً بدل أن يخمّن أسماء حقول للبحث بها، وهو ما ظلّ
        // يفشل فيه ويظهر للعميل كأنه عجز.
        const rawErr = e instanceof Error ? e.message : String(e);
        // الرسالة تصل مهرَّبة \uXXXX داخل JSON، فالبحث عن الرابط في النص الخام
        // لا يجده. نفكّ الترميز أولاً ثم نقرأ.
        const raw = (() => {
          const b = rawErr.indexOf("{");
          if (b < 0) return rawErr;
          try {
            const body = JSON.parse(rawErr.slice(b)) as { exception?: string; _server_messages?: string };
            return [body.exception ?? "", body._server_messages ?? ""].join(" ") || rawErr;
          } catch { return rawErr; }
        })();
        // الرسالة تحوي رابطين: السجل الجاري حذفه ثم المستند المانع. أخذُ الأول
        // يعيد السجل نفسه كأنه يمنع نفسه — فنستبعد ما يطابق ما نحذفه.
        const seen = new Set<string>();
        const links: Array<{ doctype: string; name: string }> = [];
        const re = /\/app\/Form\/([^/"\\]+)\/([^"\\<>]+)/g;
        for (let m = re.exec(raw); m !== null; m = re.exec(raw)) {
          const l = { doctype: decodeURIComponent(m[1]).trim(), name: decodeURIComponent(m[2]).trim() };
          if (l.doctype === doctype && l.name === docName) continue;
          const key = `${l.doctype}|${l.name}`;
          if (seen.has(key)) continue;      // الرابط يتكرّر في النص وفي الرسالة
          seen.add(key);
          links.push(l);
        }
        if (links.length) {
          return {
            result: {
              error: `لا يمكن حذف ${doctype} "${docName}" لارتباطه بمستند آخر`,
              blocked_by: links[0],
              all_blockers: links,
              next_step: "احذف المستند المذكور في blocked_by أولاً (بعد أخذ موافقة المستخدم) ثم أعد محاولة الحذف",
            },
            display: "",
          };
        }
        throw e;
      }
      return {
        result: { deleted: true, name: docName },
        display: "",
      };
    }
    case "department_review": {
      // القراءة فقط: القسم يُبلِّغ ولا يعدّل، والنصّ يُعاد كما عُدّ لتصوغه
      // سارة — لا لتُعيد حسابه.
      const dep = (args.department as Department | "all") ?? "all";
      const report = await reviewDepartments(dep);
      const guidance =
        `${report}\n\nاعرض الملاحظات كما هي بلا زيادة ولا نقص، مرتّبةً بالأهمّ،` +
        ` سطرٌ واحد لكل ملاحظة: ما هي وأين تُعالَج.` +
        ` ولا تُصلح شيئاً ولا تعرض إصلاحه — القسم يُبلِّغ فقط.`;
      return { result: report, display: guidance };
    }
    case "get_sales_report": {
      const now = new Date();
      let fromDate: string, toDate: string;
      if (args.period === "last_month") {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        fromDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        toDate = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth(), 0).getDate()}`;
      } else if (args.period === "this_year") {
        fromDate = `${now.getFullYear()}-01-01`;
        toDate = `${now.getFullYear()}-12-31`;
      } else {
        fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        toDate = now.toISOString().split("T")[0];
      }
      const fields = encodeURIComponent(JSON.stringify(["name", "customer", "grand_total", "status", "posting_date"]));
      const filters = encodeURIComponent(JSON.stringify([["posting_date", ">=", fromDate], ["posting_date", "<=", toDate], ["docstatus", "=", 1]]));
      const data = await erpGET(`/api/resource/Sales%20Invoice?limit=200&fields=${fields}&filters=${filters}`) as { data: Array<{ grand_total: number; status: string }> };
      const invoices = data?.data ?? [];
      const total = invoices.reduce((s, i) => s + (i.grand_total ?? 0), 0);
      const paid = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + (i.grand_total ?? 0), 0);
      const report = { period: (args.period as string) ?? "this_month", fromDate, toDate, totalInvoices: invoices.length, totalRevenue: total, paidRevenue: paid, unpaidRevenue: total - paid };
      return { result: report, display: "" };
    }
    case "create_custom_field": {
      if (!args.confirmed) {
        return { result: { ok: false, needs_confirmation: true,
          message: "اعرض على العميل: نوع المستند، التسمية، نوع الحقل، وهل هو إلزامي — واحصل على موافقته ثم أعد الاستدعاء بـ confirmed: true" }, display: "" };
      }
      const doctype = String(args.doctype ?? "").trim();
      const fieldname = String(args.fieldname ?? "").trim().toLowerCase();
      const label = String(args.label ?? "").trim();
      if (!doctype || !label) return { result: { ok: false, error: "نوع المستند والتسمية مطلوبان" }, display: "" };
      // Frappe يشتق أسماء الأعمدة من fieldname: أي حرف خارج هذا النمط يفسد المخطط
      if (!/^[a-z][a-z0-9_]{1,58}$/.test(fieldname)) {
        return { result: { ok: false, error: "الاسم البرمجي يجب أن يبدأ بحرف إنجليزي صغير ويحتوي حروفاً صغيرة وأرقاماً وشرطات سفلية فقط" }, display: "" };
      }
      const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
      const existing = await erpGET(`/api/resource/Custom Field?filters=${q([["dt", "=", doctype], ["fieldname", "=", fieldname]])}&fields=${q(["name"])}&limit_page_length=1`) as { data?: unknown[] };
      if ((existing?.data ?? []).length) {
        return { result: { ok: false, error: `الحقل ${fieldname} موجود بالفعل على ${doctype}` }, display: "" };
      }
      const payload: Record<string, unknown> = {
        dt: doctype, fieldname, label, fieldtype: args.fieldtype ?? "Data",
        reqd: args.reqd ? 1 : 0,
      };
      if (args.options) payload.options = args.options;
      if (args.insert_after) payload.insert_after = args.insert_after;
      await erpPOST("/api/resource/Custom Field", payload);
      return {
        result: { ok: true, doctype, fieldname, label,
          note: "أُضيف الحقل. يظهر على المستندات الجديدة والقائمة معاً — الحقول المخصصة ليست بأثر رجعي على البيانات لكنها تظهر في الواجهة فوراً" },
        display: "",
      };
    }
    case "create_print_format": {
      if (!args.confirmed) {
        return { result: { ok: false, needs_confirmation: true,
          message: "اعرض تصميم النموذج على العميل واحصل على موافقته، ثم أعد الاستدعاء بـ confirmed: true" }, display: "" };
      }
      const doctype = String(args.doctype ?? "").trim();
      const name = String(args.name ?? "").trim();
      const html = String(args.html ?? "").trim();
      if (!doctype || !name || html.length < 20) {
        return { result: { ok: false, error: "نوع المستند والاسم وقالب HTML مكتمل مطلوبة" }, display: "" };
      }
      const existing = await erpGET(`/api/resource/Print Format/${encodeURIComponent(name)}`).catch(() => null);
      if (existing) return { result: { ok: false, error: `يوجد نموذج طباعة بالاسم ${name} — اختر اسماً آخر أو راجعه أولاً` }, display: "" };

      // الخط والترويسة يُحقنان في CSS بدل تركهما للقالب: النموذج بلا خط عربي
      // يُطبع بخط لاتيني افتراضي فتبدو الفاتورة رديئة، والترويسة صورة خلفية
      // تُطبع خلف المحتوى بلا أن تزيح تخطيطه.
      const font = typeof args.font === "string" ? args.font : "Cairo";
      const letterhead = typeof args.letterhead_url === "string" ? args.letterhead_url.trim() : "";
      const baseCss = [
        `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700&display=swap');`,
        `.print-format { font-family: '${font}', 'IBM Plex Sans Arabic', sans-serif; direction: rtl; }`,
        letterhead
          ? `.print-format { background-image: url('${letterhead}'); background-repeat: no-repeat; background-position: top center; background-size: 100% auto; padding-top: 140px; }`
          : "",
        typeof args.css === "string" ? args.css : "",
      ].filter(Boolean).join("\n");

      await erpPOST("/api/resource/Print Format", {
        name, doc_type: doctype, html,
        css: baseCss,
        // standard=No يجعله نموذجاً مخصصاً قابلاً للتعديل، لا جزءاً من التطبيق
        standard: "No",
        print_format_type: "Jinja",
        custom_format: 1,
        // معطّل حتى يراه العميل ويعتمده — نموذج طباعة خاطئ يظهر للعملاء الخارجيين
        disabled: 1,
      });
      return {
        result: { ok: true, name, doctype, font, letterhead: letterhead || null,
          note: "أُنشئ النموذج **معطّلاً**. اطلب من العميل معاينته من نظامه ثم تفعيله بنفسه — لا تفعّله أنت. يمكنه ذلك من Print Format > " + name },
        display: "",
      };
    }
    case "update_customer": {
      const customer = String(args.customer ?? "").trim();
      if (!customer) return { result: { ok: false, error: "اسم العميل مطلوب" }, display: "" };

      const custFields: Record<string, unknown> = {};
      if (args.customer_type) custFields.customer_type = args.customer_type;
      if (typeof args.tax_id === "string" && args.tax_id.trim()) {
        // نفس فحص create_customer: صيغة فقط، ولا يُقال للعميل إنه "تحقق لدى الهيئة"
        const { validateTaxId } = await import("../erp/taxId");
        const check = validateTaxId(args.tax_id.trim());
        if (!check.valid) {
          return { result: { needs_clarification: true, reason: "invalid_tax_id", provided: String(args.tax_id),
            problem: check.reason, message: "الرقم الضريبي الذي أعطاه المستخدم غير صحيح الصيغة — أبلغه بالمشكلة واطلب الرقم الصحيح" }, display: "" };
        }
        custFields.tax_id = check.normalized;
      }
      if (Object.keys(custFields).length) {
        await erpPUT(`/api/resource/Customer/${encodeURIComponent(customer)}`, custFields);
      }

      // العنوان مستند مستقل مرتبط بالعميل، لا حقول داخله
      const addrInput = {
        address_line1: typeof args.address_line1 === "string" ? args.address_line1.trim() : "",
        city: typeof args.city === "string" ? args.city.trim() : "",
        country: typeof args.country === "string" ? args.country.trim() : "",
        pincode: typeof args.pincode === "string" ? args.pincode.trim() : "",
      };
      let addressAction: string | null = null;
      if (addrInput.address_line1 || addrInput.city || addrInput.country || addrInput.pincode) {
        const custDoc = await erpGET(`/api/resource/Customer/${encodeURIComponent(customer)}`) as { data?: CustomerDoc };
        const existingName = custDoc?.data?.customer_primary_address ?? null;
        const existing = await fetchCustomerAddressName(customer, existingName);
        const payload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(addrInput)) if (v) payload[k] = v;
        if (existing) {
          await erpPUT(`/api/resource/Address/${encodeURIComponent(existing)}`, payload);
          addressAction = "updated";
        } else {
          // العنوان الجديد يحتاج حقوله الإلزامية كاملة وربطاً بالعميل
          if (!addrInput.address_line1 || !addrInput.city || !addrInput.country) {
            return { result: { needs_clarification: true, reason: "address_incomplete",
              message: "لإنشاء عنوان جديد نحتاج الشارع/المبنى والمدينة والدولة معاً — اطلبها من المستخدم" }, display: "" };
          }
          await erpPOST("/api/resource/Address", {
            ...payload,
            address_title: customer,
            address_type: "Billing",
            links: [{ link_doctype: "Customer", link_name: customer }],
          });
          addressAction = "created";
        }
      }

      const after = await erpGET(`/api/resource/Customer/${encodeURIComponent(customer)}`) as { data?: CustomerDoc };
      const addrAfter = await fetchCustomerAddress(customer, after?.data?.customer_primary_address ?? null);
      const state = inspectCustomerCompleteness(after?.data ?? {}, addrAfter);
      return {
        result: {
          ok: true, customer, address: addressAction,
          complete: state.complete,
          still_missing: state.missing,
          still_missing_ar: describeMissing(state.missing),
          note: state.complete
            ? "بيانات العميل مكتملة — يمكن إصدار الفاتورة الآن"
            : `ما زال ناقصاً: ${describeMissing(state.missing)} — اطلبه من المستخدم قبل إصدار الفاتورة`,
        },
        display: "",
      };
    }
    case "get_workflow_options": {
      const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
      const [st, ac, ro] = await Promise.all([
        erpGET(`/api/resource/Workflow State?fields=${q(["name"])}&limit_page_length=0`),
        erpGET(`/api/resource/Workflow Action Master?fields=${q(["name"])}&limit_page_length=0`),
        erpGET(`/api/resource/Role?fields=${q(["name"])}&limit_page_length=0`),
      ]);
      const names = (r: unknown) => ((r as { data?: { name: string }[] })?.data ?? []).map(x => x.name);
      return {
        result: { states: names(st), actions: names(ac), roles: names(ro),
          note: "أسماء الحالات والإجراءات غير الموجودة تُنشأ تلقائياً عند create_workflow، أما الأدوار فلا — استخدم دوراً من هذه القائمة" },
        display: "",
      };
    }
    case "get_workflows": {
      const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
      const dt = (args.document_type as string | undefined)?.trim();
      const filters = dt ? `&filters=${q([["document_type", "=", dt]])}` : "";
      const res = await erpGET(`/api/resource/Workflow?fields=${q(["name", "document_type", "is_active", "workflow_state_field"])}${filters}&limit_page_length=0`);
      const list = ((res as { data?: unknown[] })?.data ?? []);
      return { result: { count: list.length, workflows: list }, display: "" };
    }
    case "create_workflow": {
      if (!args.confirmed) {
        return { result: { ok: false, needs_confirmation: true,
          message: "اعرض تصميم دورة العمل على العميل (الحالات والانتقالات والأدوار) واحصل على موافقته الصريحة، ثم أعد الاستدعاء بـ confirmed: true" }, display: "" };
      }
      const name = String(args.workflow_name ?? "").trim();
      const docType = String(args.document_type ?? "").trim();
      const states = (args.states ?? []) as Array<{ state: string; allow_edit: string; doc_status: string }>;
      const transitions = (args.transitions ?? []) as Array<{ state: string; action: string; next_state: string; allowed: string }>;
      if (!name || !docType || !states.length || !transitions.length) {
        return { result: { ok: false, error: "الاسم ونوع المستند وحالة واحدة وانتقال واحد على الأقل مطلوبة" }, display: "" };
      }

      const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
      const existing = await erpGET(`/api/resource/Workflow?filters=${q([["document_type", "=", docType]])}&fields=${q(["name"])}&limit_page_length=1`);
      if (((existing as { data?: unknown[] })?.data ?? []).length) {
        return { result: { ok: false, error: `يوجد بالفعل دورة عمل لنوع المستند ${docType} — راجعها بـ get_workflows قبل إنشاء أخرى` }, display: "" };
      }

      // الحالات والإجراءات روابط لسجلات قائمة: اسم غير موجود يُفشل الحفظ كله.
      // ننشئها أولاً — إنشاء تسمية إعدادٍ لا حركة، وهو داخل نطاق الخبير.
      const ensure = async (doctype: string, values: string[], extra: Record<string, unknown> = {}) => {
        const present = new Set(((await erpGET(`/api/resource/${encodeURIComponent(doctype)}?fields=${q(["name"])}&limit_page_length=0`)) as { data?: { name: string }[] })?.data?.map(x => x.name) ?? []);
        const created: string[] = [];
        for (const v of Array.from(new Set(values)).filter(v => v && !present.has(v))) {
          await erpPOST(`/api/resource/${encodeURIComponent(doctype)}`, { [doctype === "Workflow State" ? "workflow_state_name" : "workflow_action_name"]: v, ...extra });
          created.push(v);
        }
        return created;
      };
      const newStates = await ensure("Workflow State", [...states.map(s => s.state), ...transitions.flatMap(t => [t.state, t.next_state])]);
      const newActions = await ensure("Workflow Action Master", transitions.map(t => t.action));

      const created = await erpPOST("/api/resource/Workflow", {
        workflow_name: name,
        document_type: docType,
        // الحقل القياسي الذي يخزّن فيه Frappe حالة المستند
        workflow_state_field: "workflow_state",
        is_active: 1,
        states: states.map(s => ({ state: s.state, allow_edit: s.allow_edit, doc_status: String(s.doc_status ?? "0") })),
        transitions: transitions.map(t => ({ state: t.state, action: t.action, next_state: t.next_state, allowed: t.allowed })),
      });
      const wfName = (created as { data?: { name?: string } })?.data?.name ?? name;
      return {
        result: { ok: true, workflow: wfName, document_type: docType,
          states_created: newStates, actions_created: newActions,
          note: "دورة العمل مفعّلة. المستندات الجديدة من هذا النوع ستتبعها؛ المستندات القائمة لا تتأثر بأثر رجعي" },
        display: "",
      };
    }
    case "check_tax_setup": {
      const setup = await inspectTaxSetup();
      if (setup.ok) {
        return {
          result: {
            configured: true,
            template: setup.template,
            rates: setup.taxRows.map(r => r.rate),
            company_tax_id: setup.companyTaxId ?? null,
            note: setup.companyTaxId ? undefined : "قالب الضريبة سليم لكن الرقم الضريبي للشركة غير مسجّل — أبلغ العميل واطلب موافقته على تسجيله",
          },
          display: "",
        };
      }
      return { result: { configured: false, ...setup }, display: "" };
    }
    case "setup_tax_settings": {
      // الموافقة الصريحة شرط مُنفَّذ في الكود، لا مجرد تعليمات للوكيل
      if (args.confirmed !== true) {
        return { result: { error: "مطلوب موافقة العميل الصريحة أولاً — أبلغه بما هو ناقص في إعدادات الضريبة واطلب إذنه، ثم استدعِ الأداة بـ confirmed: true" }, display: "" };
      }
      const rate = Number(args.rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
        return { result: { error: "نسبة ضريبة غير صالحة — اسأل العميل عن النسبة المطبقة في بلده" }, display: "" };
      }
      const done: string[] = [];

      // الشركة الحالية
      const compList = await erpGET(`/api/resource/Company?limit=1&fields=${encodeURIComponent(JSON.stringify(["name", "tax_id", "abbr"]))}`) as { data?: Array<{ name: string; tax_id?: string; abbr?: string }> };
      const comp = compList?.data?.[0];
      if (!comp) return { result: { error: "لم يُعثر على شركة في النظام" }, display: "" };

      // 1) تسجيل الرقم الضريبي للشركة إن أُعطي — بعد التحقق من صيغته
      if (args.company_tax_id) {
        const check = await checkTaxIdForCompanyCountry(String(args.company_tax_id));
        if (!check.valid) {
          return { result: { needs_clarification: true, reason: "invalid_tax_id", provided: String(args.company_tax_id), problem: check.reason, message: "الرقم الضريبي للشركة غير صحيح الصيغة — أبلغ العميل بالمشكلة واطلب الرقم الصحيح" }, display: "" };
        }
        await erpPUT(`/api/resource/Company/${encodeURIComponent(comp.name)}`, { tax_id: check.normalized });
        done.push(`سُجّل الرقم الضريبي للشركة: ${check.normalized}`);
      }

      // إن كان قالب الضريبة سليماً بالفعل ولم يكن الناقص إلا الرقم الضريبي، لا نُنشئ قالباً مكرراً
      const existing = await inspectTaxSetup();
      if (existing.ok) {
        return {
          result: { success: true, template: existing.template, already_configured: true, done },
          display: "",
        };
      }

      // 2) حل الحساب الضريبي (أو استخدام ما حدده العميل)
      let accountHead = args.account_head ? String(args.account_head) : null;
      if (!accountHead) {
        const accFilters = encodeURIComponent(JSON.stringify([["is_group", "=", 0], ["root_type", "=", "Liability"]]));
        const accData = await erpGET(`/api/resource/Account?limit=50&fields=${encodeURIComponent(JSON.stringify(["name", "account_type"]))}&filters=${accFilters}`) as { data?: Array<{ name: string; account_type?: string }> };
        const accounts = accData?.data ?? [];
        accountHead = accounts.find(a => a.account_type === "Tax" && /vat|ضريب/i.test(a.name))?.name
          ?? accounts.find(a => a.account_type === "Tax")?.name
          ?? accounts.find(a => /vat|ضريب/i.test(a.name))?.name
          ?? null;
        if (!accountHead) {
          return {
            result: {
              needs_clarification: true, reason: "no_tax_account_found",
              message: "لم أجد حساباً ضريبياً في شجرة الحسابات — اسأل العميل عن الحساب الذي يريد ترحيل الضريبة إليه",
              available: accounts.map(a => a.name).slice(0, 25),
            },
            display: "",
          };
        }
      }

      // 3) إنشاء قالب ضريبة المبيعات وتعيينه افتراضياً
      const templateName = `ضريبة القيمة المضافة ${rate}%`;
      const tplDoc = {
        title: templateName,
        company: comp.name,
        is_default: 1,
        taxes: [{
          charge_type: "On Net Total",
          account_head: accountHead,
          rate,
          description: `ضريبة القيمة المضافة ${rate}%`,
        }],
      };
      const created = await erpPOST("/api/resource/Sales%20Taxes%20and%20Charges%20Template", tplDoc) as { data?: { name?: string } };
      const createdName = created?.data?.name ?? templateName;
      done.push(`أُنشئ قالب ضريبة "${createdName}" بنسبة ${rate}% على حساب "${accountHead}" وعُيّن افتراضياً`);

      return {
        result: { success: true, template: createdName, rate, account_head: accountHead, done },
        display: "",
      };
    }

    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
