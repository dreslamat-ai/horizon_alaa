// ─── منفّذ أدوات "ألاء" ──────────────────────────────────────────────────────
// نسخة مصغَّرة لمرحلة البروتوتايب — منقولة بتصرّف من
// almoaser-dev/server/agent/executeTool.ts (١٢٧٥ سطراً هناك، هنا فقط ما
// يقابل TOOLS في toolDefinitions.ts). لا بحث تقريبي معرَّب (findSimilar*)
// في هذه المرحلة — تحسين مؤجَّل لمرحلة لاحقة، ليس نسياناً.
import { erpGET, erpPOST, currentErpConfig } from "../erp/erpClient";
import { normalizeArabic, findSimilarCustomers, findSimilarItems, findSimilarSuppliers, submitDoc, getDefaultCompany, resolveCompanyInfo, postDocWithCostCenterRetry, checkTaxIdForCompanyCountry, inspectTaxSetup, fetchCustomerAddress } from "../erp/writeHelpers";
import { inspectCustomerCompleteness, describeMissing, type CustomerDoc } from "../erp/customerCompleteness";
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

    // ─── أدوات التسجيل — منقولة حرفيًا من سارة (حوكمتها كما هي) ───
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
      const requestedDue = (args.due_date as string) ?? today;
      const safeDueDate = requestedDue < today ? today : requestedDue;
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

    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
