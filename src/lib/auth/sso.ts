// ─── SSO من Frappe Desk — يُثبت الهوية فقط، لا الصلاحية ────────────────────────
// توكن HMAC-SHA256 قصير العمر (يُبنى في horizon_desk_theme.api.alaa_sso،
// بايثون، بنفس السرّ ALAA_SSO_SECRET) — نتحقق من التوقيع والصلاحية هنا
// فقط لاستخراج بريد المستخدم الذي أثبتت جلسته في Frappe هويته. الدور
// (support/admin) لا يُقرأ من التوكن أبدًا — يُستعلَم لاحقًا من
// horizon_staff بنفس الطريقة تمامًا كالدخول بكلمة سر، فمستخدم Frappe
// غير مسجَّل هناك لا يحصل على أي جلسة.
const TOKEN_TTL_SECONDS = 120;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesFromB64urlNoPad(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function hmacHex(payload: string): Promise<string> {
  const secret = process.env.ALAA_SSO_SECRET;
  if (!secret) throw new Error("ALAA_SSO_SECRET غير مضبوط في .env.local");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export type SsoIdentity = { email: string; site: string | null };

/**
 * يرجّع هوية التوكن لو موقَّع صحيح ولم تنتهِ صلاحيته، وإلا null.
 *
 * الصيغة الحالية `email|expiry|site` — الـsite جوّه التوقيع عمدًا: لما
 * كان باراميتر URL منفصل، حامل توكن صادر من موقعه كان يقدر يبدّله باسم
 * موقع مستأجر آخر وينتحل عميله. الصيغة القديمة `email|expiry` (نسخة
 * alaa_widget قبل التحديث) لسه مقبولة لكن بـsite=null — تكفي دخول
 * الموظفين ولا تكفي أبدًا إنشاء جلسة مستأجر.
 */
export async function verifySsoToken(token: string | null): Promise<SsoIdentity | null> {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const payload = new TextDecoder().decode(bytesFromB64urlNoPad(payloadB64));
  const expectedSig = await hmacHex(payload);
  if (!timingSafeEqual(expectedSig, signature)) return null;

  const [email, expiryStr, site] = payload.split("|");
  const expiry = Number(expiryStr);
  if (!email || !Number.isFinite(expiry)) return null;
  if (Date.now() / 1000 > expiry) return null;
  if (expiry - Date.now() / 1000 > TOKEN_TTL_SECONDS + 5) return null; // توكن بتاريخ إصدار مستقبلي مريب

  return { email, site: site || null };
}
