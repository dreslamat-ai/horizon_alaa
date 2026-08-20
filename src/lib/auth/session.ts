// ─── جلسة موظف Horizon — نسخة مرحلة ١ (حساب ثابت واحد) ───────────────────────
// جديد بالكامل لـ"ألاء" (لا مصدر في almoaser-dev — سارة تستخدم _core/trpc.ts
// المبني على نظام مستخدمين كامل غير موجود هنا). كوكي موقَّعة بـHMAC-SHA256
// عبر Web Crypto (لا Node's crypto module — يعمل في middleware/Edge وفي
// route handlers معًا بلا فروقات توافق)، بلا قاعدة بيانات بعد — تُستبدل
// بجدول horizon_staff فعلي في مرحلة ٤.
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "alaa_staff_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // ١٢ ساعة

export type StaffSession = { email: string; name: string };

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
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
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
    return { email: data.email, name: data.name };
  } catch {
    return null;
  }
}

/** يتحقق من بيانات دخول الموظف الثابت (env) — يُستبدل بجدول staff في مرحلة ٤ */
export function checkStaffCredentials(email: string, password: string): StaffSession | null {
  const expectedEmail = process.env.STAFF_EMAIL ?? "";
  const expectedPassword = process.env.STAFF_PASSWORD ?? "";
  if (!expectedEmail || !expectedPassword) return null;
  if (email !== expectedEmail || password !== expectedPassword) return null;
  return { email, name: process.env.STAFF_NAME ?? "موظف Horizon" };
}

/** للاستخدام داخل middleware و Route Handlers */
export async function verifySessionToken(token: string | undefined): Promise<StaffSession | null> {
  if (!token) return null;
  return verifyToken(token);
}

export async function requireStaffSession(req: NextRequest): Promise<StaffSession | null> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** للاستخدام داخل Server Components/Pages */
export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
