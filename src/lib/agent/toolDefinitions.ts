// ─── تعريفات أدوات "ألاء" ────────────────────────────────────────────────────
// نسخة مصغَّرة لمرحلة البروتوتايب — منقولة بتصرّف من
// almoaser-dev/server/agent/toolDefinitions.ts (٧٢٣ سطراً هناك، هنا فقط
// أدوات القراءة الأساسية + list_documents العامة). بلا أي أداة كتابة
// إطلاقاً — لا حاجة لقائمة حجب (EXPERT_BLOCKED_TOOLS) لأن لا شيء يُكتب هنا
// أصلاً. تُوسَّع في مراحل لاحقة بنفس النمط.
export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_documents",
      description: "قراءة أي نوع سجل (DocType) في نظام ERPNext — موظفين، فواتير، حضور، أصناف، أي شيء. استخدمها لأي سؤال عن بيانات لا تغطيه أداة أخرى أدق.",
      parameters: {
        type: "object",
        properties: {
          doctype: { type: "string", description: "اسم الـDocType بالضبط كما في ERPNext، مثل Employee أو Sales Invoice أو Attendance" },
          fields: { type: "array", items: { type: "string" }, description: "الحقول المطلوبة (افتراضي: name فقط)" },
          filters: { type: "object", description: "فلاتر بصيغة Frappe (اختياري)" },
          limit: { type: "number", description: "عدد النتائج (افتراضي 20، حد أقصى 100)" },
        },
        required: ["doctype"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_customers",
      description: "جلب قائمة العملاء أو البحث عن عميل بالاسم",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد العملاء (افتراضي 20)" },
          search: { type: "string", description: "بحث بجزء من اسم العميل" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_items",
      description: "جلب قائمة الأصناف أو البحث عن صنف بالاسم",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد الأصناف (افتراضي 20)" },
          search: { type: "string", description: "بحث بجزء من اسم الصنف" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_invoices",
      description: "جلب قائمة فواتير المبيعات مع إمكانية الفلترة",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد الفواتير (افتراضي 10)" },
          status: { type: "string", enum: ["Paid", "Unpaid", "Overdue", "Draft", "Cancelled"], description: "فلترة حسب الحالة" },
          customer: { type: "string", description: "فلترة حسب اسم العميل" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_invoice_detail",
      description: "جلب تفاصيل فاتورة محددة بالكامل بما فيها الأصناف والمبالغ",
      parameters: {
        type: "object",
        properties: {
          invoice_name: { type: "string", description: "رقم الفاتورة مثل SINV-2024-00001" },
        },
        required: ["invoice_name"],
        additionalProperties: false,
      },
    },
  },
] as const;
