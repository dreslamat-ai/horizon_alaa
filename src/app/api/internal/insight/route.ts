// ─── نقطة "تحليل ألاء اليومي" — نداء سيرفر-لسيرفر بلا جلسة مستخدم ───────────
// تحت /api/internal/ عمدًا — proxy.ts بيستثني البادئة دي من حارس الجلسة
// (نفس أسلوب balance/plans/provision المجاورة)، لكن المصادقة هنا توقيع
// HMAC خاص بـalaa_sso_secret لا x-internal-key المشترك: alaa_internal_key
// موجود بس في site_config.json بتاع control.horizonerp.cloud (السيرفر
// المركزي)، بينما alaa_sso_secret موزَّع بالفعل على كل مستأجر (مطلوب
// أصلًا لـalaa_widget/api/alaa_sso.py) — فمصدر الثقة المتاح فعليًا من
// جوّه كل مستأجر هو ده، مش المفتاح المركزي.
//
// الفرق عن /api/chat: مفيش خصم نقاط ولا حلقة أدوات — الغرض كارت استباقي
// صامت في داشبورد Home، مش محادثة. موقَّعة بحمولة site|expiry فقط بلا
// email (مفيش موظف بيسجّل دخول هنا، نداء خلفي صامت).
//
// الأرقام (مبيعات/تحصيل/متأخرات/مخزون) نفس منطق scripts/daily-digest.ts
// حرفيًا — دالة مثبتة تشتغل فعليًا يوميًا على تليجرام، مش منطق جديد غير
// مجرَّب. الجديد هنا بس: صياغة الأرقام دي في تحليل عربي قصير عبر نداء
// LLM واحد (بلا أدوات)، وكاش يومي عشان صفحة الرئيسية ماتستدعيش نموذج
// جديد مع كل تحميل.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runWithCustomerConfig, erpGET } from "@/lib/erp/erpClient";
import { invokeAgentLLM } from "@/lib/llm/llmProvider";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // نصف يوم — كافي لصفحة رئيسية بلا تكرار نداء LLM
const cache = new Map<number, { at: number; data: unknown }>();

function verifyToken(token: string): { site: string } | null {
  const secret = process.env.ALAA_SSO_SECRET;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const [site, expiryStr] = payload.split("|");
  const expiry = Number(expiryStr);
  if (!site || !expiry || Date.now() / 1000 > expiry) return null;
  return { site };
}

const f = (x: unknown) => encodeURIComponent(JSON.stringify(x));
const sar = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });

type Insight = {
  headline: string;
  body: string;
  kpis: {
    salesYesterday: number; salesCount: number;
    collectedYesterday: number; collectedCount: number;
    overdueTotal: number; overdueCustomers: number;
    topOverdue: Array<{ customer: string; amount: number }>;
    lowStock: Array<{ item_code: string; actual_qty: number }>;
  };
};

async function buildInsight(customerId: number): Promise<Insight> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split("T")[0];

  return runWithCustomerConfig(customerId, async () => {
    const inv = await erpGET(`/api/resource/Sales Invoice?filters=${f([["docstatus", "=", 1], ["posting_date", "=", yesterday]])}&fields=${f(["grand_total"])}&limit_page_length=500`) as { data?: Array<{ grand_total: number }> };
    const invRows = inv?.data ?? [];
    const salesTotal = invRows.reduce((t, r) => t + (r.grand_total ?? 0), 0);

    const pay = await erpGET(`/api/resource/Payment Entry?filters=${f([["docstatus", "=", 1], ["posting_date", "=", yesterday], ["payment_type", "=", "Receive"]])}&fields=${f(["paid_amount"])}&limit_page_length=500`) as { data?: Array<{ paid_amount: number }> };
    const payRows = pay?.data ?? [];
    const collected = payRows.reduce((t, r) => t + (r.paid_amount ?? 0), 0);

    const od = await erpGET(`/api/resource/Sales Invoice?filters=${f([["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", today]])}&fields=${f(["customer", "outstanding_amount"])}&limit_page_length=500`) as { data?: Array<{ customer: string; outstanding_amount: number }> };
    const odRows = od?.data ?? [];
    const overdueTotal = odRows.reduce((t, r) => t + (r.outstanding_amount ?? 0), 0);
    const topOverdue = [...odRows.reduce((m, r) => m.set(r.customer, (m.get(r.customer) ?? 0) + r.outstanding_amount), new Map<string, number>())]
      .sort((a, z) => z[1] - a[1]).slice(0, 3);

    const bins = await erpGET(`/api/resource/Bin?fields=${f(["item_code", "actual_qty"])}&limit_page_length=500&order_by=actual_qty asc`) as { data?: Array<{ item_code: string; actual_qty: number }> };
    const low = (bins?.data ?? []).filter(b => (b.actual_qty ?? 0) <= 10).slice(0, 5);

    const kpis: Insight["kpis"] = {
      salesYesterday: salesTotal, salesCount: invRows.length,
      collectedYesterday: collected, collectedCount: payRows.length,
      overdueTotal, overdueCustomers: new Set(odRows.map(r => r.customer)).size,
      topOverdue: topOverdue.map(([c, amt]) => ({ customer: c, amount: amt })),
      lowStock: low,
    };

    // لو مفيش حركة حقيقية إمبارح (عميل تجريبي/جديد)، رد صادق بلا LLM —
    // نداء نموذج لتوليد كلام عن صفر بيانات هلوسة لا تحليل.
    const hasSignal = salesTotal > 0 || collected > 0 || overdueTotal > 0 || low.length > 0;
    if (!hasSignal) {
      return { headline: "مفيش حركة تُذكر إمبارح", body: "لا مبيعات ولا تحصيل ولا متأخرات جديدة — يوم هادي.", kpis };
    }

    const prompt = `إنتِ "ألاء"، مساعدة Horizon ERP المالية. اكتبي تحليل يوم واحد قصير جدًا (لهجة مصرية مهنية) من الأرقام دي فقط — بلا اختراع أي رقم مش موجود تحت:
مبيعات إمبارح: ${sar(salesTotal)} ر.س (${invRows.length} فاتورة)
المحصَّل إمبارح: ${sar(collected)} ر.س (${payRows.length} سند)
إجمالي المتأخرات: ${sar(overdueTotal)} ر.س على ${kpis.overdueCustomers} عميل${topOverdue.length ? " — أكبرها: " + topOverdue.map(([c, a]) => `${c} (${sar(a)} ر.س)`).join("، ") : ""}
${low.length ? "مخزون منخفض: " + low.map(b => `${b.item_code} (${b.actual_qty})`).join("، ") : "مفيش أصناف بمخزون منخفض"}

ردّي بصيغة JSON فقط بلا أي نص خارجها: {"headline": "جملة واحدة تلخّص أهم حاجة في الأرقام", "body": "سطرين كحد أقصى: ليه ده مهم واقتراح فعل واحد لو محتاج"}`;

    const result = await invokeAgentLLM({ messages: [{ role: "user", content: prompt }], max_tokens: 300 });
    const raw = (typeof result.choices?.[0]?.message?.content === "string" ? result.choices[0].message!.content : "") ?? "";
    let parsed: { headline?: string; body?: string } = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      // رد النموذج مش JSON صالح — نعرضه كامل كـbody بدل ما نرمي عطل لصفحة الرئيسية
    }

    return {
      headline: parsed.headline || "تحليل اليوم",
      body: parsed.body || raw.slice(0, 400) || "تعذّر توليد التحليل.",
      kpis,
    };
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ error: "token مطلوب" }, { status: 400 });

  const verified = verifyToken(body.token);
  if (!verified) return NextResponse.json({ error: "توكن غير صالح أو منتهي" }, { status: 401 });

  const [customer] = await db.select().from(schema.alaaCustomers)
    .where(eq(schema.alaaCustomers.erpUrl, `https://${verified.site}`))
    .limit(1);
  if (!customer) return NextResponse.json({ error: "الموقع ده مش عميل ألاء" }, { status: 404 });
  if (customer.subscriptionStatus === "suspended" || customer.subscriptionStatus === "cancelled") {
    return NextResponse.json({ error: "الاشتراك متوقف" }, { status: 403 });
  }

  const cached = cache.get(customer.id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const insight = await buildInsight(customer.id);
    cache.set(customer.id, { at: Date.now(), data: insight });
    return NextResponse.json(insight);
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطأ غير متوقع";
    console.error("[alaa/insight]", customer.id, message);
    return NextResponse.json({ error: `تعذّر بناء التحليل: ${message}` }, { status: 500 });
  }
}
