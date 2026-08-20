// اتصال ERPNext — مرحلة ٢: اتصال لكل عميل من alaa_customers، لا إعداد
// ثابت. منقولة بتصرّف من almoaser-dev/server/erpConnection.ts (قُرئت
// ١٩-٢٠ أغسطس ٢٠٢٦) — الفرق: هناك اتصال لكل مستخدم منصة، وهنا اتصال لكل
// عميل (شركة) يختاره موظف Horizon قبل المحادثة.
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptSecret } from "../crypto";

export type ErpConfig = {
  url: string;
  username: string;
  password: string;
  source: "customer";
  provider: "erpnext";
  customerId: number;
};

export async function getErpConfigForCustomer(customerId: number): Promise<ErpConfig> {
  const rows = await db.select().from(schema.alaaCustomers).where(eq(schema.alaaCustomers.id, customerId)).limit(1);
  const customer = rows[0];
  if (!customer) throw new Error(`لا يوجد عميل بالمعرّف ${customerId}`);
  return {
    url: customer.erpUrl.replace(/\/+$/, ""),
    username: customer.erpUsername,
    password: decryptSecret(customer.erpPasswordEnc),
    source: "customer",
    provider: "erpnext",
    customerId: customer.id,
  };
}

/**
 * سبب الفشل كما ذكره خادم Frappe لا كما نخمّنه — منقولة حرفيًا من
 * erpConnection.ts الأصلي (منطق نقي، لا اعتماديات).
 */
export async function explainErpFailure(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  let serverSaid = "";
  try {
    const j = JSON.parse(raw) as { message?: string; exc_type?: string };
    serverSaid = (j.message ?? j.exc_type ?? "").trim();
  } catch {
    if (/<html/i.test(raw)) {
      return "الرابط لا يشير إلى نظام ERPNext — تأكد أنه رابط النظام لا رابط موقع آخر";
    }
  }
  const said = serverSaid.toLowerCase();
  if (said.includes("incorrect password") || said.includes("invalid login")) {
    return "كلمة المرور غير صحيحة لهذا المستخدم";
  }
  if (said.includes("not exist") || said.includes("disabled")) {
    return "المستخدم غير موجود على النظام أو حسابه موقوف";
  }
  if (res.status === 401 && !serverSaid) {
    return "رُفض تسجيل الدخول (401) — الغالب أن كلمة المرور خطأ، أو أن الحساب يطلب تحققاً ثنائياً يمنع الدخول عبر API";
  }
  if (res.status === 403) return "الخادم منع الطلب (403) — قد يكون الدخول عبر API مقيَّداً لهذا المستخدم";
  if (res.status === 417 || res.status === 429) return "محاولات كثيرة متتالية — انتظر دقائق ثم أعد المحاولة";
  if (res.status >= 500) return `النظام نفسه يرد بخطأ (${res.status}) — المشكلة على خادم ERPNext لا في بياناتك`;
  return serverSaid ? `رفض الخادم الطلب (${res.status}): ${serverSaid}` : `فشل تسجيل الدخول (${res.status})`;
}

/** اختبار اتصال مباشر — يُستخدم في واجهة إضافة عميل قبل الحفظ */
export async function testErpConnection(url: string, username: string, password: string): Promise<{ ok: boolean; loggedInAs?: string; error?: string }> {
  try {
    const cleanUrl = url.replace(/\/+$/, "");
    const res = await fetch(`${cleanUrl}/api/method/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usr: username, pwd: password }),
    });
    if (!res.ok) return { ok: false, error: await explainErpFailure(res) };
    const cookie = res.headers.get("set-cookie") ?? "";
    const m = cookie.match(/sid=([^;]+)/);
    if (!m || m[1] === "Guest") return { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
    const body = (await res.json().catch(() => ({}))) as { full_name?: string };
    return { ok: true, loggedInAs: body.full_name ?? username };
  } catch (e) {
    return { ok: false, error: `تعذّر الوصول إلى الخادم: ${e instanceof Error ? e.message : "خطأ غير معروف"}` };
  }
}

// كاش جلسات sid — مفتاح منفصل لكل عميل (url+username) عشان عملاء مختلفين
// ميشاركوش جلسة بعضهم بالغلط.
const sessionCache = new Map<string, { sid: string; expiry: number }>();

export async function getErpSession(config: ErpConfig): Promise<string> {
  const cacheKey = `${config.url}|${config.username}`;
  const cached = sessionCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiry) return cached.sid;

  const res = await fetch(`${config.url}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usr: config.username, pwd: config.password }),
  });
  if (!res.ok) throw new Error(`تعذّر الدخول إلى ERPNext: ${await explainErpFailure(res)}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  const m = cookie.match(/sid=([^;]+)/);
  if (!m || m[1] === "Guest") throw new Error("بيانات اعتماد ERPNext غير صحيحة — تحقق من اسم المستخدم وكلمة المرور");
  sessionCache.set(cacheKey, { sid: m[1], expiry: now + 6 * 60 * 60 * 1000 });
  return m[1];
}

export function invalidateErpSession(config: ErpConfig): void {
  sessionCache.delete(`${config.url}|${config.username}`);
}
