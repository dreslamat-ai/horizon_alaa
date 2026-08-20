// ─── تجزئة كلمات سر موظفي Horizon ─────────────────────────────────────────────
// جديد بالكامل — لا مصدر في سارة (سارة تعتمد على بيانات دخول خارجية عبر
// erpAuth، لا كلمات سر محلية). PBKDF2 عبر Web Crypto (لا مكتبة خارجية،
// متوافقة مع middleware/proxy Edge وNode معًا — نفس اختيار session.ts).
const ITERATIONS = 100_000;
const HASH = "SHA-256";
const KEY_LEN = 32; // بايت

function b64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesFromB64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    KEY_LEN * 8,
  );
  return new Uint8Array(derived);
}

/** ينتج سلسلة تُخزَّن في horizon_staff.passwordHash — تحمل الملح معها */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveKey(password, salt);
  return `pbkdf2:${ITERATIONS}:${b64FromBytes(salt)}:${b64FromBytes(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (iterations !== ITERATIONS) return false; // لا نتساهل مع تنسيق قديم غير معروف
  const salt = bytesFromB64(parts[2]);
  const expected = bytesFromB64(parts[3]);
  const actual = await deriveKey(password, salt);
  if (actual.length !== expected.length) return false;
  // مقارنة بزمن ثابت — تفادي هجوم التوقيت على طول التطابق
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
