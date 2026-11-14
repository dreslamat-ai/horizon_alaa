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
};

export function uiText(key: string, locale: AlaaLocale): string {
  const row = UI[key];
  if (!row || locale === "ar-EG") return key;
  const i = locale === "ar-GCC" ? 0 : locale === "ar" ? 1 : 2;
  return row[i] || (locale === "ar" ? row[0] : "") || key;
}
