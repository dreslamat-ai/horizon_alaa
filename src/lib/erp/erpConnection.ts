// اتصال ERPNext — مرحلة ٢: اتصال لكل عميل من alaa_customers، لا إعداد
// ثابت. منقولة بتصرّف من almoaser-dev/server/erpConnection.ts (قُرئت
// ١٩-٢٠ أغسطس ٢٠٢٦) — الفرق: هناك اتصال لكل مستخدم منصة، وهنا اتصال لكل
// عميل (شركة) يختاره موظف Horizon قبل المحادثة.
//
// 🔴 مراجَعة (٢١ أغسطس): يدعم الآن نوعَي اتصال — "password" (تسجيل
// دخول تقليدي، جلسة sid مؤقتة) و"api_key" (Authorization: token
// key:secret، بلا جلسة إطلاقًا). المالك رفض حسابات بأدوار مُختارة يدويًا
// ("ماتفصلش صلاحيات بمزاجك") — api_key يسمح باستخدام حساب كامل
// الصلاحيات (زي Administrator) بلا تغيير كلمة سره الحقيقية أو قفل
// جلساته الحالية، عبر توليد مفتاح API منفصل تمامًا لنفس الحساب.
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptSecret } from "../crypto";

export type ErpAuthType = "password" | "api_key";

export type ErpConfig = {
  url: string;
  username: string;
  password: string;
  authType: ErpAuthType;
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
    authType: customer.authType as ErpAuthType,
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
export async function testErpConnection(
  url: string, username: string, password: string, authType: ErpAuthType = "password",
): Promise<{ ok: boolean; loggedInAs?: string; error?: string }> {
  const cleanUrl = url.replace(/\/+$/, "");

  if (authType === "api_key") {
    try {
      const res = await fetch(`${cleanUrl}/api/method/frappe.auth.get_logged_user`, {
        headers: { Authorization: `token ${username}:${password}` },
      });
      if (!res.ok) return { ok: false, error: await explainErpFailure(res) };
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: true, loggedInAs: body.message ?? "حساب API Key" };
    } catch (e) {
      return { ok: false, error: `تعذّر الوصول إلى الخادم: ${e instanceof Error ? e.message : "خطأ غير معروف"}` };
    }
  }

  try {
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
// ميشاركوش جلسة بعضهم بالغلط. لا يُستخدم إطلاقًا لـapi_key (بلا جلسة).
const sessionCache = new Map<string, { sid: string; expiry: number }>();

/**
 * قيمة هيدر المصادقة الجاهزة — "sid=<token>" لتسجيل الدخول التقليدي
 * (تُستخدم كـCookie)، أو "token <key>:<secret>" لـapi_key (تُستخدم
 * كـAuthorization مباشرة، بلا أي نداء شبكة لأنها لا تنتهي صلاحيتها).
 */
export async function getErpAuthHeader(config: ErpConfig): Promise<{ header: "Cookie" | "Authorization"; value: string }> {
  if (config.authType === "api_key") {
    return { header: "Authorization", value: `token ${config.username}:${config.password}` };
  }

  const cacheKey = `${config.url}|${config.username}`;
  const cached = sessionCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiry) return { header: "Cookie", value: `sid=${cached.sid}` };

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
  return { header: "Cookie", value: `sid=${m[1]}` };
}

export function invalidateErpSession(config: ErpConfig): void {
  sessionCache.delete(`${config.url}|${config.username}`);
}
