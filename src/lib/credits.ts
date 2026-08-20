// ─── طبقة إنفاذ الاشتراك والنقاط ──────────────────────────────────────────────
// جديدة بالكامل (خطة "ألاء" القسم ٦) — الجزء المفقود فعليًا في كل الكودبيس
// المرجعي: حقلا subscriptionStatus/subscriptionEndDate في سارة موجودان
// لكن غير مُنفَّذين في أي middleware. هنا يُبنى من الصفر ويُختبَر بدالة
// واحدة صريحة قابلة للاختبار.
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

export const MESSAGE_COST = 1; // نقطة واحدة لكل رسالة — لا مستندات تُنشأ هنا أصلاً (وضع قراءة فقط)

export type AccessDenialReason = "not_found" | "subscription_expired" | "subscription_suspended" | "credits_exhausted";

export type AccessResult =
  | { ok: true; customer: typeof schema.alaaCustomers.$inferSelect }
  | { ok: false; reason: AccessDenialReason; message: string };

/**
 * الفحص الحاسم — يُستدعى أول شيء قبل أي استدعاء لنموذج اللغة.
 * الثلاثة معًا: الحالة، تاريخ الانتهاء، والرصيد — لا أحدها بديل عن الآخر.
 */
export async function assertAlaaAccessAllowed(customerId: number): Promise<AccessResult> {
  const rows = await db.select().from(schema.alaaCustomers).where(eq(schema.alaaCustomers.id, customerId)).limit(1);
  const customer = rows[0];
  if (!customer) return { ok: false, reason: "not_found", message: "لا يوجد عميل بهذا المعرّف" };

  if (customer.subscriptionStatus === "suspended" || customer.subscriptionStatus === "cancelled") {
    return { ok: false, reason: "subscription_suspended", message: `اشتراك "${customer.companyNameAr}" موقوف — تواصل مع الإدارة` };
  }

  const endDate = new Date(customer.subscriptionEndDate);
  if (Number.isNaN(endDate.getTime()) || endDate.getTime() < Date.now()) {
    return { ok: false, reason: "subscription_expired", message: `اشتراك "${customer.companyNameAr}" منتهٍ — يحتاج تجديد` };
  }

  if (customer.creditsBalance <= 0) {
    return { ok: false, reason: "credits_exhausted", message: `رصيد "${customer.companyNameAr}" نفد — يحتاج شحن أو ترقية باقة` };
  }

  return { ok: true, customer };
}

/**
 * سجل معاملات — منقول حرفيًا من مبدأ creditTransactions في سارة
 * (almoaser-dev/server/credits.ts:logTransaction). كل تغيير في الرصيد
 * يُسجَّل هنا: النوع، الكمية (موجبة/سالبة)، الرصيد بعدها، ومن نفّذها.
 */
async function logCreditTransaction(data: {
  alaaCustomerId: number;
  staffId?: number;
  type: "message" | "monthly_refill" | "topup" | "adjustment";
  amount: number;
  balanceAfter: number;
  note?: string;
}): Promise<void> {
  await db.insert(schema.alaaCreditTransactions).values(data);
}

/** يُستدعى بعد رد ناجح فقط — الخصم الفعلي، لا مجرد الفحص */
export async function deductCredits(customerId: number, amount: number, staffId?: number): Promise<void> {
  const [updated] = await db.update(schema.alaaCustomers)
    .set({ creditsBalance: sql`${schema.alaaCustomers.creditsBalance} - ${amount}` })
    .where(eq(schema.alaaCustomers.id, customerId))
    .returning({ creditsBalance: schema.alaaCustomers.creditsBalance });
  await logCreditTransaction({
    alaaCustomerId: customerId, staffId, type: "message", amount: -amount,
    balanceAfter: updated.creditsBalance, note: "خصم رسالة محادثة",
  });
}

/** شحن/خصم يدوي من لوحة الإعدادات — دائمًا بمعرفة موظف مسؤول */
export async function adjustCreditsManually(
  customerId: number, amount: number, staffId: number,
): Promise<typeof schema.alaaCustomers.$inferSelect | undefined> {
  const [updated] = await db.update(schema.alaaCustomers)
    .set({ creditsBalance: sql`${schema.alaaCustomers.creditsBalance} + ${amount}`, updatedAt: new Date().toISOString() })
    .where(eq(schema.alaaCustomers.id, customerId))
    .returning();
  if (!updated) return undefined;
  await logCreditTransaction({
    alaaCustomerId: customerId, staffId, type: "adjustment", amount,
    balanceAfter: updated.creditsBalance,
    note: amount > 0 ? "منح نقاط يدويًا من لوحة الإعدادات" : "خصم نقاط يدويًا من لوحة الإعدادات",
  });
  return updated;
}
