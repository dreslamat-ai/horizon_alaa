// ─── مراجعة نتائج التنفيذ قبل تسليم الرد ─────────────────────────────────────
// منقولة كاملةً (بلا تعديل منطقي) من
// almoaser-dev/server/agent/outcomeGuard.ts (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦).
//
// القاعدة الوحيدة: لا يُعلَن نجاحٌ لا تسنده نتيجة أداة ناجحة. في "ألاء" كل
// الأدوات قراءة فقط (isMutating ترجع false دائمًا فعليًا)، لكن المنطق يبقى
// كما هو — دفاع مستقبلي لو أُضيفت أداة كتابة يومًا، لا كود ميت.

export type ToolOutcome = {
  name: string;
  ok: boolean;
  error?: string;
};

const MUTATING = /^(create_|update_|delete_|submit_|cancel_|setup_|save_)/;

export function isMutating(toolName: string): boolean {
  return MUTATING.test(toolName);
}

export function outcomeOf(name: string, rawJson: string): ToolOutcome {
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch { return { name, ok: false, error: "رد غير مفهوم من الأداة" }; }
  if (!parsed || typeof parsed !== "object") return { name, ok: false, error: "رد فارغ من الأداة" };
  const o = parsed as Record<string, unknown>;
  if (o.error) return { name, ok: false, error: String(o.error) };
  if (o.needs_clarification) return { name, ok: false, error: "الأداة طلبت توضيحاً ولم تنفّذ" };
  return { name, ok: true };
}

const SUCCESS_CLAIM = /(تم تنفيذ|تم إنشاء|تم الإنشاء|تم الحذف|تم حذف|تم الاعتماد|تم اعتماد|تم التعديل|تم تعديل|تم الإلغاء|تم إلغاء|تم التفعيل|تم تفعيل|تم الحفظ|تم بنجاح|أنشأتُ|حذفتُ|اعتمدتُ|عدّلتُ|أُنشئت|حُذف|اعتُمد|عُدّل|أُلغي|فُعّل)/;

export function claimsSuccess(text: string): boolean {
  return SUCCESS_CLAIM.test(text);
}

const TOOL_LABELS: Record<string, string> = {
  get_invoices: "عرض الفواتير", get_invoice_detail: "قراءة تفاصيل فاتورة",
  get_customers: "عرض العملاء", get_items: "عرض الأصناف",
  list_documents: "البحث في المستندات",
};

export function labelFor(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "عملية على النظام";
}

function briefError(e?: string): string {
  const t = (e ?? "").trim();
  if (!t) return "فشل بلا سبب معلن";
  return t.length > 220 ? t.slice(0, 217) + "…" : t;
}

export type Verdict =
  | { ok: true }
  | { ok: false; reason: string; replacement: string };

export function verifyReply(reply: string, outcomes: ToolOutcome[]): Verdict {
  if (!claimsSuccess(reply)) return { ok: true };

  const mutations = outcomes.filter(o => isMutating(o.name));
  const succeeded = mutations.filter(o => o.ok);
  const failed = mutations.filter(o => !o.ok);

  if (succeeded.length > 0 && failed.length === 0) return { ok: true };

  if (failed.length > 0) {
    const lines = failed.map(f => `• ${labelFor(f.name)}: ${briefError(f.error)}`).join("\n");
    return {
      ok: false,
      reason: `ادّعاء نجاح مع فشل ${failed.length} أداة`,
      replacement: `⚠️ **لم يكتمل التنفيذ.**\n\nحاولتُ تنفيذ طلبك ولم ينجح:\n${lines}\n\nلم يتغيّر شيء في نظامك. أخبرني إن أردت أن أعالج السبب أو أجرّب طريقة أخرى.`,
    };
  }

  return {
    ok: false,
    reason: "ادّعاء نجاح بلا أي عملية تنفيذ",
    replacement: "لم أنفّذ أي تغيير على نظامك في هذه الخطوة. وضّح لي المطلوب بالتحديد وسأنفّذه ثم أؤكّد لك النتيجة الفعلية.",
  };
}

export function summarizeOutcomes(outcomes: ToolOutcome[]): string {
  if (!outcomes.length) {
    return "لم أنفّذ أي عملية. أعد صياغة طلبك من فضلك وسأتولّاه.";
  }
  const ok = outcomes.filter(o => o.ok);
  const bad = outcomes.filter(o => !o.ok);

  if (!bad.length) {
    return `تمّت ${ok.length === 1 ? "العملية" : `${ok.length} عمليات`} على نظامك:\n`
      + ok.map(o => `• ${labelFor(o.name)}`).join("\n");
  }
  if (!ok.length) {
    return `⚠️ **لم يكتمل التنفيذ.**\n`
      + bad.map(o => `• ${labelFor(o.name)}: ${briefError(o.error)}`).join("\n");
  }
  const okWrites = ok.filter(o => isMutating(o.name));
  return (okWrites.length ? `تمّ جزء من الطلب دون بقيته:\n\n**نجح:**\n`
      + okWrites.map(o => `• ${labelFor(o.name)}`).join("\n") + `\n\n**لم ينجح:**\n`
      : `⚠️ **لم يكتمل التنفيذ.**\n\n`)
    + bad.map(o => `• ${labelFor(o.name)}: ${briefError(o.error)}`).join("\n");
}
