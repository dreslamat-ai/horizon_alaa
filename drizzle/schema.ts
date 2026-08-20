// ─── نموذج بيانات "ألاء" ─────────────────────────────────────────────────────
// جديد بالكامل (لا مصدر في almoaser-dev — جداول سارة مبنية على users.id
// كمفتاح أجنبي، لا مكافئ له هنا). مستلهَم من نمط erpnextConnections في
// درِزل سارة (قُرئ ١٩-٢٠ أغسطس ٢٠٢٦) في شكل الحقول فقط، ببنية علائقية
// مختلفة تمامًا (خطة "ألاء" القسم ٢). SQLite لمرحلة التطوير — يُرقّى
// لـMySQL/Postgres وقت الإنتاج الفعلي إن احتاج الحمل ذلك.
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const horizonStaff = sqliteTable("horizon_staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["support", "admin"] }).notNull().default("support"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const alaaPlans = sqliteTable("alaa_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameAr: text("name_ar").notNull(),
  monthlyPriceSar: real("monthly_price_sar").notNull().default(0),
  monthlyCreditsAllowance: integer("monthly_credits_allowance").notNull(),
});

export const alaaCustomers = sqliteTable("alaa_customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyNameAr: text("company_name_ar").notNull(),
  companyNameEn: text("company_name_en"),

  // اتصال Horizon ERPNext الخاص بهذا العميل — حساب موظف قراءة محدود
  // الصلاحيات، لا مدير نظام (اتساقًا مع القرار الموثَّق، ويستاهل تأكيد
  // فعلي عند كل عميل جديد بعد اكتشاف صلاحيات حساب الاختبار الواسعة).
  erpUrl: text("erp_url").notNull(),
  erpUsername: text("erp_username").notNull(),
  erpPasswordEnc: text("erp_password_enc").notNull(), // AES-256-GCM بمفتاح ALAA_ENC_SECRET

  planId: integer("plan_id").notNull().references(() => alaaPlans.id),
  subscriptionStatus: text("subscription_status", {
    enum: ["trial", "active", "past_due", "suspended", "cancelled"],
  }).notNull().default("trial"),
  subscriptionEndDate: text("subscription_end_date").notNull(),

  creditsBalance: integer("credits_balance").notNull().default(0),
  monthlyCreditsAllowance: integer("monthly_credits_allowance").notNull(),
  creditsResetAt: text("credits_reset_at").notNull().default(sql`(current_timestamp)`),

  createdByStaffId: integer("created_by_staff_id").notNull().references(() => horizonStaff.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const alaaConversations = sqliteTable("alaa_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alaaCustomerId: integer("alaa_customer_id").notNull().references(() => alaaCustomers.id),
  staffId: integer("staff_id").notNull().references(() => horizonStaff.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

// سجل معاملات النقاط — منقول حرفيًا من مبدأ creditTransactions في سارة
// (almoaser-dev/drizzle/schema.ts). كان مفقودًا بالكامل هنا: deductCredits
// كانت UPDATE مباشر بلا أي أثر — لا تاريخ، لا رصيد قبل/بعد، لا مصدر
// الخصم. بلا هذا الجدول لا إجابة لسؤال "امتى اتخصمت النقاط دي وليه".
export const alaaCreditTransactions = sqliteTable("alaa_credit_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alaaCustomerId: integer("alaa_customer_id").notNull().references(() => alaaCustomers.id),
  staffId: integer("staff_id").references(() => horizonStaff.id), // فارغ لعمليات نظامية (تجديد شهري تلقائي مثلاً)
  // message (رسالة −1) | monthly_refill (تعبئة شهرية) | topup (شحن مدفوع) | adjustment (تعديل إداري يدوي)
  type: text("type", { enum: ["message", "monthly_refill", "topup", "adjustment"] }).notNull(),
  amount: integer("amount").notNull(), // موجب للإضافة، سالب للخصم
  balanceAfter: integer("balance_after").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const alaaMessages = sqliteTable("alaa_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull().references(() => alaaConversations.id),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolResultsJson: text("tool_results_json"),
  creditsCost: integer("credits_cost").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});
