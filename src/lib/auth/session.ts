// ─── جلسة موظف Horizon — مرحلة ٤: حساب حقيقي من horizon_staff ────────────────
// جديد بالكامل. مرحلة ١ كانت حساب ثابت واحد في env — هذا الملف يستبدله
// بالكامل: تسجيل الدخول يستعلم قاعدة البيانات ويتحقق من كلمة سر مُجزّأة
// (password.ts)، والجلسة تحمل هوية وصلاحية الموظف الحقيقيتين (id/role)
// لا قيمًا ثابتة. كوكي موقَّعة بـHMAC-SHA256 عبر Web Crypto كما كانت.
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "../db";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "alaa_staff_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // ١٢ ساعة

export type StaffRole = "support" | "admin";
export type StaffSession = { id: number; email: string; name: string; role: StaffRole };

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET غير مضبوط في .env.local");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64urlFromBytes(new Uint8Array(sig));
}

export async function createSessionToken(session: StaffSession): Promise<string> {
  const payload = b64urlFromBytes(
    new TextEncoder().encode(JSON.stringify({ ...session, exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 })),
  );
  return `${payload}.${await sign(payload)}`;
}

async function verifyToken(token: string): Promise<StaffSession | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const key = await hmacKey();
  const valid = await crypto.subtle.verify("HMAC", key, bytesFromB64url(sig), new TextEncoder().encode(payload));
  if (!valid) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(bytesFromB64url(payload))) as StaffSession & { exp: number };
    if (Date.now() > data.exp) return null;
    return { id: data.id, email: data.email, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

/**
 * يتحقق من بيانات دخول موظف حقيقي من horizon_staff.
 *
 * لا فرق في رسالة الفشل بين "بريد غير موجود" و"كلمة سر خطأ" — نفس نمط
 * الأمان القياسي، منع تعداد البريد الإلكتروني (email enumeration).
 */
export async function checkStaffCredentials(email: string, password: string): Promise<StaffSession | null> {
  const rows = await db.select().from(schema.horizonStaff).where(eq(schema.horizonStaff.email, email)).limit(1);
  const staff = rows[0];
  if (!staff || !staff.isActive) return null;
  const ok = await verifyPassword(password, staff.passwordHash);
  if (!ok) return null;
  return { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
}

/**
 * التوكن الموقَّع وحده لا يكفي — اكتُشف فعليًا (اختبار حي: عطّلنا موظفًا
 * وجلسته القديمة استمرت تعمل حتى انتهاء صلاحية التوكن، ١٢ ساعة) أن
 * `isActive`/`role` وقت إصدار التوكن قد يختلفان عن حالة الموظف الحالية —
 * إداري عطّل موظفًا للتوّ يتوقّع أن يُقفل وصوله فورًا لا خلال ١٢ ساعة.
 * لذلك: بعد التحقق من التوقيع، يُعاد الاستعلام عن الصف الحقيقي دائمًا.
 * تكلفة استعلام واحد لكل طلب مقبولة مقابل ضمان الإنفاذ الفوري.
 */
export async function verifySessionToken(token: string | undefined): Promise<StaffSession | null> {
  if (!token) return null;
  const claimed = await verifyToken(token);
  if (!claimed) return null;

  const rows = await db.select().from(schema.horizonStaff).where(eq(schema.horizonStaff.id, claimed.id)).limit(1);
  const current = rows[0];
  if (!current || !current.isActive) return null;

  return { id: current.id, email: current.email, name: current.name, role: current.role };
}

export async function requireStaffSession(req: NextRequest): Promise<StaffSession | null> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** للاستخدام داخل Server Components/Pages */
export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
