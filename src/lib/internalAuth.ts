// ─── حارس الواجهة الداخلية ────────────────────────────────────────────────────
// المستهلكان: provisioner منصة Horizon-Saas (تجهيز عميل مع كل موقع جديد)
// وصفحة «اشتراكي والفواتير» في horizon_client (قراءة الرصيد) — كلاهما
// بايثون على نفس المضيف ينادي 127.0.0.1:4001 مباشرة. المفتاح سرّ مشترك
// في env الطرفين، لا جلسة متصفح إطلاقًا: هذه مسارات خادم-لخادم فقط.
import type { NextRequest } from "next/server";

export function isInternalRequest(req: NextRequest): boolean {
  const expected = process.env.ALAA_INTERNAL_KEY;
  // غياب المفتاح من env يقفل الواجهة كلها — لا وضع "مفتوح مؤقتًا".
  if (!expected) return false;
  const got = req.headers.get("x-internal-key") ?? "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
