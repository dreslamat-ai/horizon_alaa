// ─── الملخص اليومي الاستباقي — يُرسل صباحًا على بوت تليجرام ──────────────────
// الميزة التنافسية ٣ (٢٤ أغسطس): لا منافس عربي عنده استباقية أصلًا.
// يجمع: مبيعات أمس + المحصَّل + المتأخرات + المخزون المنخفض في رسالة واحدة.
//
// ٢٥ أغسطس — بقى متعدد المستأجرين: ملخص هورايزون للموظفين والمالك (كما
// كان)، وملخص لكل مستأجر باقتُه فيها allowDailyDigest وله شات تليجرام
// موثَّق — كلٌّ من نظامه هو. وفي الآخر: إشعار للمالك بتجارب ألاء اللي
// انتهت خلال آخر ٢٤ ساعة (متابعة بيع، لا أتمتة قرار).
// التشغيل: npx tsx --env-file=.env.local scripts/daily-digest.ts
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { runWithCustomerConfig, erpGET } from "../src/lib/erp/erpClient";

const CUSTOMER_ID = Number(process.env.TG_ALAA_CUSTOMER ?? 1);
const OWNER_CHAT = process.env.TG_OWNER_CHAT ?? "119770400";

const f = (x: unknown) => encodeURIComponent(JSON.stringify(x));
const sar = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });

async function send(chat: string, text: string) {
  const token = process.env.TG_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(e => console.error("فشل إرسال لـ", chat, e));
}

async function buildDigest(customerId: number): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];

  return runWithCustomerConfig(customerId, async () => {
    // مبيعات أمس (المعتمدة)
    const inv = await erpGET(`/api/resource/Sales Invoice?filters=${f([["docstatus", "=", 1], ["posting_date", "=", yesterday]])}&fields=${f(["grand_total"])}&limit_page_length=500`) as { data?: Array<{ grand_total: number }> };
    const invRows = inv?.data ?? [];
    const salesTotal = invRows.reduce((t, r) => t + (r.grand_total ?? 0), 0);

    // المحصَّل أمس (سندات قبض معتمدة)
    const pay = await erpGET(`/api/resource/Payment Entry?filters=${f([["docstatus", "=", 1], ["posting_date", "=", yesterday], ["payment_type", "=", "Receive"]])}&fields=${f(["paid_amount"])}&limit_page_length=500`) as { data?: Array<{ paid_amount: number }> };
    const payRows = pay?.data ?? [];
    const collected = payRows.reduce((t, r) => t + (r.paid_amount ?? 0), 0);

    // المتأخرات (مستحقة وفات تاريخها)
    const od = await erpGET(`/api/resource/Sales Invoice?filters=${f([["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", today]])}&fields=${f(["customer", "outstanding_amount"])}&limit_page_length=500`) as { data?: Array<{ customer: string; outstanding_amount: number }> };
    const odRows = od?.data ?? [];
    const overdueTotal = odRows.reduce((t, r) => t + (r.outstanding_amount ?? 0), 0);
    const topOverdue = [...odRows.reduce((m, r) => m.set(r.customer, (m.get(r.customer) ?? 0) + r.outstanding_amount), new Map<string, number>())]
      .sort((a, z) => z[1] - a[1]).slice(0, 3);

    // مخزون منخفض (≤ 10)
    const bins = await erpGET(`/api/resource/Bin?fields=${f(["item_code", "actual_qty"])}&limit_page_length=500&order_by=actual_qty asc`) as { data?: Array<{ item_code: string; actual_qty: number }> };
    const low = (bins?.data ?? []).filter(b => (b.actual_qty ?? 0) <= 10).slice(0, 5);

    let msg = `☀️ صباح الخير — ملخص ${yesterday}\n\n`;
    msg += `💰 مبيعات أمس: ${sar(salesTotal)} ر.س (${invRows.length} فاتورة)\n`;
    msg += `💵 المحصَّل أمس: ${sar(collected)} ر.س (${payRows.length} سند)\n`;
    msg += `⏰ إجمالي المتأخرات: ${sar(overdueTotal)} ر.س على ${new Set(odRows.map(r => r.customer)).size} عميل\n`;
    if (topOverdue.length) {
      msg += topOverdue.map(([c, amt]) => `   • ${c}: ${sar(amt)} ر.س`).join("\n") + "\n";
    }
    if (low.length) {
      msg += `📦 مخزون منخفض: ${low.map(b => `${b.item_code} (${b.actual_qty})`).join(" · ")}\n`;
    }
    msg += `\nاسألني عن أي تفصيلة 👇`;
    return msg;
  });
}

async function main() {
  // ١) ملخص هورايزون — المالك + الموظفون الموثقون (السلوك الأصلي)
  const staff = await db.select().from(schema.alaaTgUsers).where(eq(schema.alaaTgUsers.kind, "staff"));
  const staffTargets = new Set<string>([OWNER_CHAT, ...staff.filter(s => s.verifiedAt).map(s => s.chatId)]);
  try {
    const digest = await buildDigest(CUSTOMER_ID);
    for (const chat of staffTargets) await send(chat, digest);
    console.log(`ملخص هورايزون أُرسل لـ${staffTargets.size} مستلم`);
  } catch (e) {
    console.error("فشل ملخص هورايزون:", e);
  }

  // ٢) ملخص كل مستأجر باقته تشمله وله شات موثق — كلٌّ من نظامه هو،
  // وفشل واحد لا يوقف الباقين
  const customers = await db.select().from(schema.alaaCustomers);
  for (const c of customers) {
    if (c.id === CUSTOMER_ID) continue;
    if (c.subscriptionStatus === "suspended" || c.subscriptionStatus === "cancelled") continue;
    if (new Date(c.subscriptionEndDate).getTime() < Date.now()) continue;
    const [plan] = await db.select().from(schema.alaaPlans).where(eq(schema.alaaPlans.id, c.planId)).limit(1);
    if (!plan?.allowDailyDigest) continue;
    const chats = await db.select().from(schema.alaaTgUsers)
      .where(and(eq(schema.alaaTgUsers.kind, "tenant"), eq(schema.alaaTgUsers.alaaCustomerId, c.id)));
    const verified = chats.filter(t => t.verifiedAt);
    if (!verified.length) continue;
    try {
      const digest = await buildDigest(c.id);
      for (const t of verified) await send(t.chatId, digest);
      console.log(`ملخص ${c.companyNameAr} أُرسل لـ${verified.length} شات`);
    } catch (e) {
      console.error(`فشل ملخص ${c.companyNameAr}:`, e);
    }
  }

  // ٣) تجارب ألاء اللي انتهت خلال آخر ٢٤ ساعة ⟵ إشعار متابعة للمالك
  const dayAgo = Date.now() - 864e5;
  const endedTrials = customers.filter(c =>
    c.subscriptionStatus === "trial"
    && new Date(c.subscriptionEndDate).getTime() < Date.now()
    && new Date(c.subscriptionEndDate).getTime() >= dayAgo);
  for (const c of endedTrials) {
    await send(OWNER_CHAT,
      `⏳ تجربة ألاء بتاعة «${c.companyNameAr}» انتهت النهارده\n`
      + `الرصيد المتبقي وقت الانتهاء: ${c.creditsBalance} نقطة\n`
      + `المحادثة عندهم متوقفة برسالة توجيه لصفحة الاشتراك — فرصة مكالمة بيع 📞`);
  }
  if (endedTrials.length) console.log(`إشعارات نهاية تجربة: ${endedTrials.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
