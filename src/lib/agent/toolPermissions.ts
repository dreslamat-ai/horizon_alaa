// ─── تضييق الأدوات بصلاحيات حساب الاتصال في ERPNext ───────────────────────────
// منقولة بتصرّف من almoaser-dev/server/agent/toolPermissions.ts (قُرئت
// ٢٠ أغسطس ٢٠٢٦، مراجعة حرفية بطلب المالك). في سارة الدالة الأصلية اسمها
// نفسه ومحاطة بمنطق صلاحيات مستخدمين متعددي المستويات (TOOL_PERMISSIONS
// الداخلية) — لا مقابل له هنا: ألاء ليس فيها إلا دور واحد يستخدم
// المحادثة (support/admin يفرّقان بس على واجهة الإعدادات، لا على أدوات
// المحادثة نفسها). فقط narrowToolsByErpPermissions نُقلت، كما نصّت الخطة
// الأصلية (docs/decisions أو القسم ٥ من خطة ألاء).
import { currentErpConfig } from "../erp/erpClient";

export async function narrowToolsByErpPermissions<T extends { function: { name: string } }>(
  tools: T[],
): Promise<T[]> {
  try {
    const cfg = currentErpConfig();
    if (!cfg.url || !cfg.username) return tools;
    const { cachedErpCapabilities, fetchErpCapabilities, erpAllowsTool } = await import("../erp/erpPermissions");
    const caps = cachedErpCapabilities(cfg.url, cfg.username);
    if (!caps) {
      // تحديث غير محجوب — لا ينتظره هذا الطلب، وتستفيد منه الرسائل التالية
      void (async () => {
        try {
          const { getErpSession } = await import("../erp/erpConnection");
          const sid = await getErpSession(cfg);
          await fetchErpCapabilities({ url: cfg.url, username: cfg.username, cookie: `sid=${sid}` });
        } catch { /* الطبقة إرشادية — الفشل هنا لا يعني شيئاً للمستخدم */ }
      })();
      return tools;
    }
    if (caps.unrestricted) return tools;
    return tools.filter(t => erpAllowsTool(caps, t.function.name));
  } catch (e) {
    console.warn("[alaa] تعذّر تضييق الأدوات بصلاحيات ERP:", e instanceof Error ? e.message : e);
    return tools;
  }
}
