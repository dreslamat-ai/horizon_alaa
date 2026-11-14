// ─── الترجمة حسب البلد — لهجة ألاء ولغة رسائل الواجهة ──────────────────────────
// نفس تقسيم horizonerp.cloud: ar-EG (مصري احترافي — الأصل) / ar-GCC (خليجي أبيض
// احترافي) / ar (فصحى معاصرة) / en. المصدر: alaa_customers.locale الذي يرسله
// provisioner منصة Horizon-Saas من نسخة الموقع المحفوظة لحظة التسجيل.
export type AlaaLocale = "ar-EG" | "ar-GCC" | "ar" | "en";
export const LOCALES: AlaaLocale[] = ["ar-EG", "ar-GCC", "ar", "en"];

export function normalizeLocale(v: string | null | undefined): AlaaLocale {
  return (LOCALES as string[]).includes(v ?? "") ? (v as AlaaLocale) : "ar-EG";
}

/** قسم «اللغة» في تعليمات النظام — يحلّ محل القسم الثابت في SCOPE_RULES. */
export function languageRule(locale: AlaaLocale): string {
  const shared = "المصطلحات التقنية وأسماء المستندات في Horizon ERP تُكتب بالإنجليزية عند الحاجة.";
  switch (locale) {
    case "en":
      return `## Language
Write in **English only** — clear, professional, warm and brief. Technical terms and Horizon ERP document names stay as they are. **Do not mix in any other language**, even if a tool result or an error comes back in Arabic: translate its meaning. If the user writes in Arabic, answer in Arabic for that message only, then return to English.`;
    case "ar-GCC":
      return `## اللغة واللهجة
اكتبي بالعربية وحدها، **بلهجة خليجية بيضاء احترافية** (كما يكتب موظف محترف في السعودية أو الإمارات): «الحين»، «وش»، «تبي»، «شيّك»، «راح»، «لين» — باعتدال، بلا مبالغة ولا مفردات محلية ضيقة، وبلا أي مفردة مصرية (لا «دلوقتي»، لا «إزاي»، لا «مش»، لا «ده/دي»). الأرقام والمصطلحات المالية بالفصحى. ${shared} **لا تُدخلي أي حرف من لغة ثالثة داخل النص.**`;
    case "ar":
      return `## اللغة
اكتبي **بالعربية الفصحى المعاصرة** وحدها — واضحة، مهنية، دافئة ومختصرة، بلا أي مفردة عامية مصرية أو خليجية. ${shared} **لا تُدخلي أي حرف من لغة ثالثة داخل النص.**`;
    default:
      return `## اللغة واللهجة
اكتبي بالعربية وحدها، **بلهجة مصرية احترافية** قريبة من الفصحى (كما يكتب محاسب محترف في القاهرة): دافئة ومختصرة، بلا مبالغة في العامية. ${shared} **لا تُدخلي أي حرف من لغة ثالثة داخل النص.**`;
  }
}

// رسائل الواجهة الثابتة التي تصل للعميل من /api/chat (ليست من النموذج)
const UI: Record<string, [string, string, string]> = {
  // المفتاح = النص المصري الأصلي؛ القيمة = (خليجي، فصحى، English)
  "رصيدك من نقاط ألاء خلص — اشحن من صفحة «اشتراكي والفواتير» في نظامك وهرجع أرد عليك فورًا 🌟":
    ["رصيدك من نقاط ألاء خلص — اشحن من صفحة «اشتراكي والفواتير» في نظامك وأرجع أرد عليك فورًا 🌟",
     "نفد رصيدك من نقاط ألاء — اشحنه من صفحة «اشتراكي والفواتير» في نظامك وسأعود للرد عليك فورًا 🌟",
     "You're out of Alaa points — top up from the “My subscription & invoices” page in your system and I'll be right back 🌟"],
  "اشتراك ألاء انتهى — جدّده من صفحة «اشتراكي والفواتير» في نظامك وهرجع معاك على طول 🌟":
    ["اشتراك ألاء انتهى — جدّده من صفحة «اشتراكي والفواتير» في نظامك وأرجع معك على طول 🌟",
     "انتهى اشتراك ألاء — جدّده من صفحة «اشتراكي والفواتير» في نظامك وسأعود معك فورًا 🌟",
     "Your Alaa subscription has ended — renew it from the “My subscription & invoices” page in your system and I'll be right back 🌟"],
  "أعاد النموذج استجابة فارغة — حاول تاني":
    ["أعاد النموذج استجابة فارغة — حاول مرة ثانية", "أعاد النموذج استجابة فارغة — حاول مجددًا", "The model returned an empty response — please try again"],
  "عذراً، حصل عطل:":
    ["عذرًا، صار عطل:", "عذرًا، حدث عطل:", "Sorry, something went wrong:"],
  "خطأ غير متوقع":
    ["", "", "Unexpected error"],
  // ─── الودجت (AlaaWidget.tsx) ───
  "اعرض آخر 5 فواتير مبيعات": ["", "", "Show the last 5 sales invoices"],
  "قائمة العملاء": ["", "", "Customer list"],
  "حمّل PDF آخر فاتورة": ["", "", "Download the latest invoice PDF"],
  "افتح شاشة فواتير المبيعات": ["", "", "Open the sales invoices screen"],
  "افتح فاتورة جديدة": ["", "", "Open a new invoice"],
  "إزاي أضيف عميل جديد؟": ["كيف أضيف عميل جديد؟", "كيف أضيف عميلًا جديدًا؟", "How do I add a new customer?"],
  "إزاي أعمل أمر تشغيل؟": ["كيف أسوّي أمر تشغيل؟", "كيف أنشئ أمر تشغيل؟", "How do I create a work order?"],
  "قائمة الأصناف": ["", "", "Item list"],
  "⬇ تحميل الفاتورة PDF": ["", "", "⬇ Download invoice PDF"],
  "حصل خطأ. جرّب تاني.": ["صار خطأ. جرّب مرة ثانية.", "حدث خطأ. حاول مجددًا.", "Something went wrong. Please try again."],
  "مش قادرة أوصل للسيرفر. اطمن على الاتصال.": ["ما أقدر أوصل للسيرفر. تأكد من الاتصال.", "لا أستطيع الوصول إلى الخادم. تحقق من الاتصال.", "I can't reach the server. Check your connection."],
  "تحدّث مع ألاء": ["", "", "Chat with Alaa"],
  "محادثة ألاء": ["", "", "Alaa chat"],
  "مساعدة Horizon الذكية": ["", "", "Horizon's AI assistant"],
  "إغلاق": ["", "", "Close"],
  "رصيد النقاط:": ["", "", "Points balance:"],
  "🟢 نشط": ["", "", "🟢 Active"],
  "مفيش اشتراك مفعَّل لهذا الموقع — تواصل مع إدارة Horizon": ["ما فيه اشتراك مفعَّل لهذا الموقع — تواصل مع إدارة Horizon", "لا يوجد اشتراك مفعَّل لهذا الموقع — تواصل مع إدارة Horizon", "No active subscription for this site — contact Horizon"],
  "أهلاً 👋 أنا ألاء. اسألني عن أي بيانات في نظام": ["هلا 👋 أنا ألاء. اسألني عن أي بيانات في نظام", "أهلًا 👋 أنا ألاء. اسألني عن أي بيانات في نظام", "Hi 👋 I'm Alaa. Ask me about any data in"],
  "وأجيبك فورًا.": ["", "", "and I'll answer right away."],
  "اكتب رسالتك…": ["", "", "Type your message…"],
  "مفيش اشتراك مفعَّل": ["ما فيه اشتراك مفعَّل", "لا يوجد اشتراك مفعَّل", "No active subscription"],
  "إرسال": ["", "", "Send"],
  // ─── بوت تليجرام ───
  "🆕 تسجيل بلاغ": ["", "", "🆕 Report an issue"],
  "💬 اسأل ألاء": ["", "", "💬 Ask Alaa"],
  "رصيدك من نقاط ألاء خلص 🌟 — اشحن من صفحة «اشتراكي والفواتير» في نظامك وهرجع أرد عليك فورًا.":
    ["رصيدك من نقاط ألاء خلص 🌟 — اشحن من صفحة «اشتراكي والفواتير» في نظامك وأرجع أرد عليك فورًا.",
     "نفد رصيدك من نقاط ألاء 🌟 — اشحنه من صفحة «اشتراكي والفواتير» في نظامك وسأعود للرد عليك فورًا.",
     "You're out of Alaa points 🌟 — top up from the “My subscription & invoices” page in your system and I'll be right back."],
  "اشتراك ألاء انتهى — جدّده من صفحة «اشتراكي والفواتير» في نظامك وهرجع معاك على طول.":
    ["اشتراك ألاء انتهى — جدّده من صفحة «اشتراكي والفواتير» في نظامك وأرجع معك على طول.",
     "انتهى اشتراك ألاء — جدّده من صفحة «اشتراكي والفواتير» في نظامك وسأعود معك فورًا.",
     "Your Alaa subscription has ended — renew it from the “My subscription & invoices” page in your system and I'll be right back."],
  "الخدمة موقوفة مؤقتًا — تواصل مع إدارة Horizon.": ["", "", "The service is temporarily paused — contact Horizon."],
  "بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقّي باقتك من صفحة «اشتراكي والفواتير» وهيشتغل معاك فورًا.":
    ["بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقّي باقتك من صفحة «اشتراكي والفواتير» ويشتغل معك فورًا.",
     "بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقِّ باقتك من صفحة «اشتراكي والفواتير» وسيعمل معك فورًا.",
     "The Telegram bot is a “Business” plan feature 🌟 — upgrade from the “My subscription & invoices” page and it starts right away."],
  "بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقّي باقتك من صفحة «اشتراكي والفواتير» في نظامك وهيشتغل معاك فورًا.":
    ["بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقّي باقتك من صفحة «اشتراكي والفواتير» في نظامك ويشتغل معك فورًا.",
     "بوت تليجرام من مزايا باقة «أعمال» 🌟 — رقِّ باقتك من صفحة «اشتراكي والفواتير» في نظامك وسيعمل معك فورًا.",
     "The Telegram bot is a “Business” plan feature 🌟 — upgrade from the “My subscription & invoices” page in your system and it starts right away."],
  "📎 استلمت الملف وحفظت مرجعه.": ["", "", "📎 Got the file and saved its reference."],
  "ما قدرتش أسمع الرسالة — جرّب تاني أو اكتبها.": ["ما قدرت أسمع الرسالة — جرّب مرة ثانية أو اكتبها.", "لم أستطع سماع الرسالة — حاول مجددًا أو اكتبها.", "I couldn't make out the voice message — try again or type it."],
  "🎙️ سمعتك:": ["", "", "🎙️ I heard:"],
  "وثّق دخولك الأول (ابعت إيميلك) وبعدها ابعت صورة الفاتورة.": ["وثّق دخولك أول (أرسل إيميلك) وبعدها أرسل صورة الفاتورة.", "وثّق دخولك أولًا (أرسل بريدك) ثم أرسل صورة الفاتورة.", "Verify first (send your email), then send the invoice photo."],
  "تسجيل الفواتير من الصور متاح لفريق Horizon فقط حاليًا.": ["", "", "Recording invoices from photos is currently available to the Horizon team only."],
  "📷 استلمت الصورة — بقرأها…": ["📷 استلمت الصورة — أقراها…", "📷 استلمت الصورة — أقرؤها…", "📷 Got the photo — reading it…"],
  "ما قدرتش أقرأ الفاتورة من الصورة — جرّب صورة أوضح.": ["ما قدرت أقرا الفاتورة من الصورة — جرّب صورة أوضح.", "لم أستطع قراءة الفاتورة من الصورة — جرّب صورة أوضح.", "I couldn't read the invoice from the photo — try a clearer one."],
  "أنا ألاء — مساعدة Horizon الذكية.\n\nللبدء اكتب إيميلك المسجل عندنا، وهيوصلك رمز دخول عليه.":
    ["أنا ألاء — مساعدة Horizon الذكية.\n\nللبدء اكتب إيميلك المسجل عندنا، ويوصلك رمز دخول عليه.",
     "أنا ألاء — مساعدة Horizon الذكية.\n\nللبدء اكتب بريدك المسجل لدينا، وسيصلك رمز دخول عليه.",
     "I'm Alaa — Horizon's AI assistant.\n\nTo start, type the email registered with us and a login code will be sent to it."],
  "الإيميل ده مش مسجل عندنا — اتأكد منه أو تواصل مع فريق Horizon.": ["هالإيميل مو مسجل عندنا — تأكد منه أو تواصل مع فريق Horizon.", "هذا البريد غير مسجل لدينا — تحقق منه أو تواصل مع فريق Horizon.", "That email isn't registered with us — double-check it or contact the Horizon team."],
  "تعذّر إرسال الرمز حاليًا — جرّب بعد دقيقة.": ["", "", "Couldn't send the code right now — try again in a minute."],
  "بعتنا رمزًا من ٦ أرقام على": ["أرسلنا رمز من ٦ أرقام على", "أرسلنا رمزًا من ٦ أرقام إلى", "We sent a 6-digit code to"],
  "— اكتبه هنا خلال ١٠ دقايق.": ["— اكتبه هنا خلال ١٠ دقائق.", "— اكتبه هنا خلال ١٠ دقائق.", "— type it here within 10 minutes."],
  "الرمز انتهت صلاحيته — ابعت إيميلك تاني.": ["الرمز انتهت صلاحيته — أرسل إيميلك مرة ثانية.", "انتهت صلاحية الرمز — أرسل بريدك مجددًا.", "The code has expired — send your email again."],
  "الرمز غير صحيح — جرّب تاني.": ["الرمز غير صحيح — جرّب مرة ثانية.", "الرمز غير صحيح — حاول مجددًا.", "Wrong code — try again."],
  "أهلاً بيك في فريق Horizon 💼": ["هلا بك في فريق Horizon 💼", "أهلًا بك في فريق Horizon 💼", "Welcome to the Horizon team 💼"],
  "أهلاً بحضرتك — حساب": ["هلا بك — حساب", "أهلًا بك — حساب", "Welcome — account"],
  "تم التحقق ✅": ["", "", "Verified ✅"],
  "اسألني عن بياناتك مباشرة، أو دوس «": ["اسألني عن بياناتك مباشرة، أو اضغط «", "اسألني عن بياناتك مباشرة، أو اضغط «", "Ask me about your data directly, or tap “"],
  "» لتسجيل شكوى/بلاغ يوصل الفريق فورًا.": ["» لتسجيل شكوى/بلاغ يوصل الفريق فورًا.", "» لتسجيل شكوى/بلاغ يصل إلى الفريق فورًا.", "” to file a complaint or report that reaches the team instantly."],
  "اكتب إيميلك المسجل الأول عشان أبعتلك رمز الدخول.": ["اكتب إيميلك المسجل أول عشان أرسل لك رمز الدخول.", "اكتب بريدك المسجل أولًا لأرسل إليك رمز الدخول.", "Type your registered email first so I can send you the login code."],
  "اكتب بلاغك في رسالة واحدة (المشكلة + أي تفاصيل تساعدنا)، وهيتسجل فورًا برقم متابعة.": ["اكتب بلاغك في رسالة وحدة (المشكلة + أي تفاصيل تساعدنا)، ويتسجل فورًا برقم متابعة.", "اكتب بلاغك في رسالة واحدة (المشكلة + أي تفاصيل تساعدنا)، وسيُسجَّل فورًا برقم متابعة.", "Describe the issue in one message (the problem plus any helpful details) — it's logged instantly with a tracking number."],
  "اتفضل اسأل 👌": ["تفضّل اسأل 👌", "تفضّل بالسؤال 👌", "Go ahead, ask 👌"],
  "تعذّر تسجيل البلاغ — جرّب تاني أو كلمنا مباشرة.": ["تعذّر تسجيل البلاغ — جرّب مرة ثانية أو كلّمنا مباشرة.", "تعذّر تسجيل البلاغ — حاول مجددًا أو تواصل معنا مباشرة.", "Couldn't log the report — try again or contact us directly."],
  "اتسجل بلاغك برقم": ["تسجّل بلاغك برقم", "سُجِّل بلاغك برقم", "Your report was logged as"],
  "✅ الفريق هيتواصل معاك قريبًا.": ["✅ الفريق بيتواصل معك قريبًا.", "✅ سيتواصل معك الفريق قريبًا.", "✅ The team will contact you soon."],
  "فاتورة": ["", "", "Invoice"],
  "— الملف مرفق 📄": ["", "", "— file attached 📄"],
  "ملغاة — مافيش ملف يتطبع ليها.": ["ملغاة — ما فيه ملف ينطبع لها.", "ملغاة — لا ملف يُطبع لها.", "is cancelled — there is no file to print for it."],
  "ما قدرتش أطلّع ملف": ["ما قدرت أطلّع ملف", "لم أستطع إخراج ملف", "I couldn't produce the file for"],
  "حاليًا — جرّب تاني أو من شاشة النظام.": ["حاليًا — جرّب مرة ثانية أو من شاشة النظام.", "حاليًا — حاول مجددًا أو من شاشة النظام.", "right now — try again or from the system screen."],
  "حصل خطأ مؤقت — جرّب تاني.": ["صار خطأ مؤقت — جرّب مرة ثانية.", "حدث خطأ مؤقت — حاول مجددًا.", "A temporary error occurred — try again."],
  // ─── الملخص اليومي ───
  "☀️ صباح الخير — ملخص": ["", "", "☀️ Good morning — summary for"],
  "💰 مبيعات أمس:": ["", "", "💰 Yesterday's sales:"],
  "فاتورة)": ["", "", "invoices)"],
  "💵 المحصَّل أمس:": ["", "", "💵 Collected yesterday:"],
  "سند)": ["", "", "receipts)"],
  "⏰ إجمالي المتأخرات:": ["", "", "⏰ Total overdue:"],
  "على": ["", "", "across"],
  "عميل": ["", "", "customers"],
  "📦 مخزون منخفض:": ["", "", "📦 Low stock:"],
  "ر.س": ["", "", "SAR"],
  "اسألني عن أي تفصيلة 👇": ["اسألني عن أي تفصيلة 👇", "اسألني عن أي تفصيل 👇", "Ask me about any detail 👇"],
};

export function uiText(key: string, locale: AlaaLocale): string {
  const row = UI[key];
  if (!row || locale === "ar-EG") return key;
  const i = locale === "ar-GCC" ? 0 : locale === "ar" ? 1 : 2;
  return row[i] || (locale === "ar" ? row[0] : "") || key;
}
