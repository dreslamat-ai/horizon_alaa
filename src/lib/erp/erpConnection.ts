// اتصال ERPNext — نسخة مصغَّرة لمرحلة البروتوتايب (إعداد ثابت من متغيرات
// البيئة، بلا قاعدة بيانات ولا تشفير بعد). منقولة بتصرّف من
// almoaser-dev/server/erpConnection.ts (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦) — الفرق
// الجوهري: هناك كل مستخدم منصة له اتصال ERP خاص محفوظ ومشفَّر، وهنا اتصال
// واحد ثابت لحساب Horizon التجريبي حتى تُبنى مرحلة ٢ (جدول alaa_customers).

export type ErpConfig = {
  url: string;
  username: string;
  password: string;
  source: "system";
  provider: "erpnext";
};

export function fixedErpConfig(): ErpConfig {
  const url = (process.env.ERPNEXT_URL ?? "").replace(/\/+$/, "");
  const username = process.env.ERPNEXT_USERNAME ?? "";
  const password = process.env.ERPNEXT_PASSWORD ?? "";
  if (!url || !username || !password) {
    throw new Error(
      "إعداد ERPNext ناقص — لازم ERPNEXT_URL وERPNEXT_USERNAME وERPNEXT_PASSWORD في .env.local"
    );
  }
  return { url, username, password, source: "system", provider: "erpnext" };
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

// كاش جلسة sid واحد بما أن الاتصال ثابت في هذه المرحلة.
let sessionCache: { sid: string; expiry: number } | null = null;

export async function getErpSession(config: ErpConfig): Promise<string> {
  const now = Date.now();
  if (sessionCache && now < sessionCache.expiry) return sessionCache.sid;

  const res = await fetch(`${config.url}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usr: config.username, pwd: config.password }),
  });
  if (!res.ok) throw new Error(`تعذّر الدخول إلى ERPNext: ${await explainErpFailure(res)}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  const m = cookie.match(/sid=([^;]+)/);
  if (!m || m[1] === "Guest") throw new Error("بيانات اعتماد ERPNext غير صحيحة — تحقق من اسم المستخدم وكلمة المرور");
  sessionCache = { sid: m[1], expiry: now + 6 * 60 * 60 * 1000 };
  return m[1];
}

export function invalidateErpSession(): void {
  sessionCache = null;
}
