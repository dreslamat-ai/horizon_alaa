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
      description: "قراءة أي نوع سجل (DocType) في نظام Horizon ERP — موظفين، فواتير، حضور، أصناف، أي شيء. استخدمها لأي سؤال عن بيانات لا تغطيه أداة أخرى أدق.",
      parameters: {
        type: "object",
        properties: {
          doctype: { type: "string", description: "اسم الـDocType بالضبط كما في Horizon ERP، مثل Employee أو Sales Invoice أو Attendance" },
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
  {
    type: "function" as const,
    function: {
      name: "get_invoice_pdf_link",
      description: "رابط تحميل فاتورة كملف PDF جاهز للطباعة — استخدمها لما يُطلب إرسال/تحميل/طباعة فاتورة. اعرض الرابط الناتج في ردّك كرابط ماركداون بالضبط: [تحميل الفاتورة PDF](الرابط كما رجع من الأداة بلا أي تعديل)",
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
  // ─── أدوات التسجيل — منقولة حرفيًا من سارة (بطلب المالك، ٢٤ أغسطس) ───
  {
    type: "function" as const,
    function: {
      name: "get_doctype_fields",
      description: "حقول أي نوع مستند (الإلزامي والاختياري وأنواعها) — استدعيها دائمًا قبل create_document لنوع لا تعرفين حقوله، ولا تخترعي اسم حقل",
      parameters: {
        type: "object",
        properties: { doctype: { type: "string", description: "اسم النوع بالإنجليزية مثل Quotation أو Supplier" } },
        required: ["doctype"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_document",
      description: "إنشاء أي مستند يسمح به النظام (عرض سعر، أمر بيع، مورد، إذن تسليم...) كمسودة. للفواتير والعملاء والأصناف والدفعات استخدمي أدواتها المتخصصة الأذكى. اقرئي الحقول أولًا بـ get_doctype_fields",
      parameters: {
        type: "object",
        properties: {
          doctype: { type: "string" },
          values: { type: "object", description: "حقول المستند وقيمها كما يعرفها النظام" },
        },
        required: ["doctype", "values"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "create_customer",
      description: "إنشاء عميل جديد. لا تستخدمها أبداً قبل البحث بـ get_customers والتأكد من عدم وجود العميل — الأداة نفسها ترفض الإنشاء إذا وُجد عميل مطابق أو مشابه وتعيد قائمة المرشحين",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "اسم العميل" },
          customer_type: { type: "string", enum: ["Company", "Individual"], description: "نوع العميل: شركة أو فرد (الافتراضي Company)" },
          mobile_no: { type: "string", description: "رقم الجوال (اختياري)" },
          email_id: { type: "string", description: "البريد الإلكتروني (اختياري)" },
          tax_id: { type: "string", description: "الرقم الضريبي للعميل (15 رقماً يبدأ وينتهي بـ 3 وفق نظام ضريبة القيمة المضافة السعودي) — مطلوب للعملاء من نوع شركة/منشأة، اسأل المستخدم عنه عند إنشاء عميل شركة" },
        },
        required: ["customer_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_item",
      description: "إنشاء صنف/خدمة جديدة. لا تستخدمها أبداً قبل البحث بـ get_items والتأكد من عدم وجود الصنف — الأداة نفسها ترفض الإنشاء إذا وُجد صنف مطابق أو مشابه وتعيد قائمة المرشحين",
      parameters: {
        type: "object",
        properties: {
          item_name: { type: "string", description: "اسم الصنف أو الخدمة" },
          item_code: { type: "string", description: "كود الصنف (اختياري — يُستخدم الاسم إذا لم يُحدد)" },
          standard_rate: { type: "number", description: "سعر البيع الافتراضي (اختياري)" },
          is_service: { type: "boolean", description: "true إذا كان خدمة (غير مخزنية)، false إذا كان منتجاً مخزنياً. الافتراضي true" },
          item_group: { type: "string", description: "مجموعة الصنف (اختياري — الافتراضي: All Item Groups)" },
        },
        required: ["item_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice",
      description: "إنشاء فاتورة مبيعات جديدة في Horizon ERP كمسودة. تُحتسب ضريبة القيمة المضافة 15% تلقائياً وفق النظام السعودي ما لم يحدد المستخدم خلاف ذلك",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "اسم العميل (name field في Horizon ERP)" },
          items: {
            type: "array",
            description: "قائمة الأصناف",
            items: {
              type: "object",
              properties: {
                item_code: { type: "string", description: "كود الصنف" },
                qty: { type: "number", description: "الكمية" },
                rate: { type: "number", description: "السعر (قبل الضريبة)" },
              },
              required: ["item_code", "qty", "rate"],
              additionalProperties: false,
            },
          },
          due_date: { type: "string", description: "تاريخ الاستحقاق بصيغة YYYY-MM-DD (اختياري)" },
          apply_vat: { type: "boolean", description: "احتساب ضريبة القيمة المضافة 15% (الافتراضي true). اجعلها false فقط إذا طلب المستخدم صراحةً فاتورة بدون ضريبة أو معفاة" },
        },
        required: ["customer", "items"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_payment_entry",
      description: "تسجيل دفعة: مستلمة من عميل (Receive) أو مدفوعة لمورد (Pay). يمكن ربطها بفاتورة محددة لسدادها. تُنشأ كمسودة ثم تُعتمد بـ submit_document",
      parameters: {
        type: "object",
        properties: {
          payment_type: { type: "string", enum: ["Receive", "Pay"], description: "Receive = قبض من عميل، Pay = صرف لمورد" },
          party: { type: "string", description: "اسم العميل (لـ Receive) أو المورد (لـ Pay)" },
          amount: { type: "number", description: "مبلغ الدفعة" },
          reference_invoice: { type: "string", description: "رقم الفاتورة المراد سدادها مثل ACC-SINV-2026-00001 (اختياري — لربط الدفعة بالفاتورة)" },
          mode_of_payment: { type: "string", description: "طريقة الدفع مثل Cash أو Bank (اختياري)" },
        },
        required: ["payment_type", "party", "amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "submit_document",
      description: "اعتماد (Submit) أي مستند لتسجيله رسمياً في الحسابات: فاتورة مبيعات، فاتورة مشتريات، دفعة، أو قيد يومية",
      parameters: {
        type: "object",
        properties: {
          doctype: { type: "string", description: "اسم DocType بالإنجليزية كما في Horizon ERP — أي نوع مستند: Sales Invoice, Purchase Invoice, Payment Entry, Journal Entry, Customer, Supplier, Item, Delivery Note, Sales Order, Purchase Order, Purchase Receipt, Stock Entry, Quotation, Lead, Address, Contact, Warehouse, Cost Center — أو أي DocType آخر في النظام" },
          document_name: { type: "string", description: "رقم المستند مثل ACC-SINV-2026-00001 أو ACC-PAY-2026-00001" },
        },
        required: ["doctype", "document_name"],
        additionalProperties: false,
      },
    },
  },
] as const;
