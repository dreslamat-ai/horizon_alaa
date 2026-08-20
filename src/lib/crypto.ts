// ─── تشفير بيانات اتصال ERPNext الخاصة بكل عميل ───────────────────────────────
// خوارزمية AES-256-GCM منقولة كنمط من almoaser-dev/server/erpConnection.ts
// (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦) — لكن بمفتاح ALAA_ENC_SECRET مستقل تمامًا عن
// JWT_SECRET الخاص بمنصة المعاصر (تحذير أمني من الاستكشاف: تسرّب توكن
// ويدجت/تطبيق منفصل بنفس السرّ يفتح بابًا نحو فك تشفير بيانات عملاء آخرين
// — هذا المشروع مستودع منفصل بخزنة أسرار منفصلة، فالفصل بنيوي لا انضباطي).
import crypto from "crypto";

function getKey(): Buffer {
  const secret = process.env.ALAA_ENC_SECRET;
  if (!secret) throw new Error("ALAA_ENC_SECRET غير مضبوط في .env.local");
  return crypto.createHash("sha256").update(`alaa-erp-conn:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(encStr: string): string {
  const [ivB64, tagB64, dataB64] = encStr.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
