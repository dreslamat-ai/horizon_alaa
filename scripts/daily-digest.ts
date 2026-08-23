// ─── الملخص اليومي الاستباقي — يُرسل صباحًا على بوت تليجرام ──────────────────
// الميزة التنافسية ٣ (٢٤ أغسطس): لا منافس عربي عنده استباقية أصلًا.
// يجمع: مبيعات أمس + المحصَّل + المتأخرات + المخزون المنخفض في رسالة
// واحدة للموظفين الموثقين والمالك. يعمل بـcron (٧ صباح السعودية).
// التشغيل: npx tsx --env-file=.env.local scripts/daily-digest.ts
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { runWithCustomerConfig, erpGET } from "../src/lib/erp/erpClient";

const CUSTOMER_ID = Number(process.env.TG_ALAA_CUSTOMER ?? 1);
const OWNER_CHAT = process.env.TG_OWNER_CHAT ?? "119770400";

const f = (x: unknown) => encodeURIComponent(JSON.stringify(x));
const sar = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });

async function main() {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];

  const digest = await runWithCustomerConfig(CUSTOMER_ID, async () => {
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

  // المستلمون: المالك + كل موظف موثَّق في البوت
  const staff = await db.select().from(schema.alaaTgUsers).where(eq(schema.alaaTgUsers.kind, "staff"));
  const targets = new Set<string>([OWNER_CHAT, ...staff.filter(s => s.verifiedAt).map(s => s.chatId)]);

  const token = process.env.TG_BOT_TOKEN;
  for (const chat of targets) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: digest }),
    }).catch(e => console.error("فشل إرسال لـ", chat, e));
  }
  console.log(`أُرسل الملخص لـ${targets.size} مستلم`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
