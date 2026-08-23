// ─── بوت تليجرام @HorizonCSBot — بوابة ألاء والبلاغات (٢٤ أغسطس ٢٠٢٦) ────────
// التدفق: /start ⟵ إيميل ⟵ رمز يوصل على الإيميل (عبر SMTP نظام ERPNext،
// نقطة alaa_widget.api.alaa_mail الموقَّعة بسر SSO المشترك) ⟵ توثيق.
// موظف (horizon_staff) = ألاء كاملة بنفس أدوات الويب. عميل (إيميله مطابق
// لعميل على النظام) = بياناته هو فقط (أداتان مقيّدتان بفلتر مفروض في
// الكود لا في التعليمات) + تسجيل بلاغ يتحول Issue فعلية وإشعار فوري
// للموظفين المشتركين والمالك.
import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runWithCustomerConfig } from "@/lib/erp/erpClient";
import { getErpConfigForCustomer, getErpAuthHeader } from "@/lib/erp/erpConnection";
import { assertAlaaAccessAllowed, deductCredits, MESSAGE_COST } from "@/lib/credits";
import { modeRules, identityLine } from "@/lib/agent/agentModes";
import { TOOLS } from "@/lib/agent/toolDefinitions";
import { executeTool } from "@/lib/agent/executeTool";
import { invokeAgentLLM } from "@/lib/llm/llmProvider";
import { sanitizeReply, isUsableReply, UNUSABLE_REPLY_FALLBACK } from "@/lib/agent/replyGuard";

const ALAA_CUSTOMER_ID = Number(process.env.TG_ALAA_CUSTOMER ?? 1);
const OWNER_CHAT = process.env.TG_OWNER_CHAT ?? "119770400";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_BTN = "🆕 تسجيل بلاغ";
const CHAT_BTN = "💬 اسأل ألاء";

type TgUpdate = { message?: { chat?: { id?: number }; from?: { first_name?: string }; text?: string } };

async function tg(method: string, payload: Record<string, unknown>) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) throw new Error("TG_BOT_TOKEN غير مضبوط");
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function mainKeyboard() {
  return { keyboard: [[{ text: CHAT_BTN }, { text: REPORT_BTN }]], resize_keyboard: true };
}

async function say(chatId: string, text: string, withKeyboard = false) {
  // تليجرام حده 4096 محرفًا، والجداول الماركداونية بتتبعتر — تُبسَّط لنص
  const clean = text.replace(/\*\*/g, "").replace(/^\|(.+)\|$/gm, m => m.replace(/\s*\|\s*/g, "  ·  ").replace(/^ +·|· +$/g, "")).slice(0, 4000);
  await tg("sendMessage", { chat_id: chatId, text: clean, ...(withKeyboard ? { reply_markup: mainKeyboard() } : {}) });
}

async function erpFetch(path: string, init?: RequestInit) {
  const cfg = await getErpConfigForCustomer(ALAA_CUSTOMER_ID);
  const auth = await getErpAuthHeader(cfg);
  return fetch(`${cfg.url}${path}`, {
    ...init,
    headers: { [auth.header]: auth.value, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** إيميل ⟵ هوية: موظف من horizon_staff أو عميل من ERPNext (Customer ثم Contact) */
async function lookupIdentity(email: string): Promise<{ kind: "staff" | "customer"; name: string; erpCustomer?: string } | null> {
  const staff = await db.select().from(schema.horizonStaff).where(eq(schema.horizonStaff.email, email)).limit(1);
  if (staff.length && staff[0].isActive) return { kind: "staff", name: staff[0].name };

  const f = (x: unknown) => encodeURIComponent(JSON.stringify(x));
  const direct = await erpFetch(`/api/resource/Customer?filters=${f([["email_id", "=", email]])}&fields=${f(["name", "customer_name"])}`);
  if (direct.ok) {
    const j = (await direct.json()) as { data?: Array<{ name: string; customer_name: string }> };
    if (j.data?.length) return { kind: "customer", name: j.data[0].customer_name, erpCustomer: j.data[0].name };
  }
  const ce = await erpFetch(`/api/resource/Contact Email?filters=${f([["email_id", "=", email]])}&fields=${f(["parent"])}`);
  if (ce.ok) {
    const j = (await ce.json()) as { data?: Array<{ parent: string }> };
    for (const row of j.data ?? []) {
      const dl = await erpFetch(`/api/resource/Dynamic Link?filters=${f([["parenttype", "=", "Contact"], ["parent", "=", row.parent], ["link_doctype", "=", "Customer"]])}&fields=${f(["link_name"])}`);
      if (dl.ok) {
        const dj = (await dl.json()) as { data?: Array<{ link_name: string }> };
        if (dj.data?.length) return { kind: "customer", name: dj.data[0].link_name, erpCustomer: dj.data[0].link_name };
      }
    }
  }
  return null;
}

async function sendOtpEmail(email: string, code: string) {
  const secret = process.env.ALAA_SSO_SECRET;
  if (!secret) throw new Error("ALAA_SSO_SECRET غير مضبوط");
  const cfg = await getErpConfigForCustomer(ALAA_CUSTOMER_ID);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${email}|${code}|${ts}`).digest("hex");
  const res = await fetch(`${cfg.url}/api/method/alaa_widget.api.alaa_mail.send_login_code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code, ts, sig }),
    signal: AbortSignal.timeout(25_000),
  });
  return res.ok;
}

const otpHashOf = (code: string, chatId: string) => createHash("sha256").update(`${code}:${chatId}`).digest("hex");

async function upsertTg(chatId: string, patch: Partial<typeof schema.alaaTgUsers.$inferInsert>) {
  const ex = await db.select().from(schema.alaaTgUsers).where(eq(schema.alaaTgUsers.chatId, chatId)).limit(1);
  if (ex.length) await db.update(schema.alaaTgUsers).set(patch).where(eq(schema.alaaTgUsers.chatId, chatId));
  else await db.insert(schema.alaaTgUsers).values({ chatId, ...patch });
}

/** أدوات العميل — الفلتر مفروض في الكود: لا يرى غير مستنداته مهما سأل */
const CUSTOMER_TOOLS = [
  { type: "function" as const, function: { name: "my_invoices", description: "فواتير هذا العميل فقط (آخر 20)", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function" as const, function: { name: "my_invoice_detail", description: "تفاصيل فاتورة بعينها لهذا العميل", parameters: { type: "object", properties: { invoice_name: { type: "string" } }, required: ["invoice_name"], additionalProperties: false } } },
];

async function runCustomerTool(name: string, args: Record<string, unknown>, erpCustomer: string): Promise<string> {
  const f = (x: unknown) => encodeURIComponent(JSON.stringify(x));
  if (name === "my_invoices") {
    const r = await erpFetch(`/api/resource/Sales Invoice?filters=${f([["customer", "=", erpCustomer]])}&fields=${f(["name", "posting_date", "grand_total", "outstanding_amount", "status", "currency"])}&limit_page_length=20&order_by=posting_date desc`);
    return JSON.stringify(((await r.json()) as { data?: unknown[] }).data ?? []);
  }
  if (name === "my_invoice_detail") {
    const inv = String(args.invoice_name ?? "");
    const r = await erpFetch(`/api/resource/Sales Invoice/${encodeURIComponent(inv)}`);
    if (!r.ok) return JSON.stringify({ error: "الفاتورة غير موجودة" });
    const doc = ((await r.json()) as { data?: { customer?: string } }).data;
    if (doc?.customer !== erpCustomer) return JSON.stringify({ error: "هذه الفاتورة لا تخص حسابك" });
    return JSON.stringify(doc);
  }
  return JSON.stringify({ error: "أداة غير معروفة" });
}

type Msg = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

async function alaaAnswer(userText: string, who: { kind: "staff" | "customer"; name: string; erpCustomer?: string }): Promise<string> {
  const access = await assertAlaaAccessAllowed(ALAA_CUSTOMER_ID);
  if (!access.ok) return "الخدمة موقوفة مؤقتًا — تواصل مع إدارة Horizon.";

  const isCustomer = who.kind === "customer";
  const system = isCustomer
    ? `${identityLine}\n\nأنتِ الآن تخدمين العميل «${who.name}» عبر تليجرام. مسموح لكِ فقط بياناته هو (فواتيره) عبر أدواتك — أي طلب لبيانات غيره أو بيانات عامة عن النظام اعتذري عنه بلطف. الردود مختصرة ومناسبة لرسائل تليجرام (بلا جداول ماركداون).`
    : `${identityLine}\n\nالعميل الحالي الذي تخدمينه: **Horizon** (عبر تليجرام — الردود مختصرة وبلا جداول ماركداون، نقاط قصيرة بدلها).\n\n${modeRules()}`;

  const messages: Msg[] = [{ role: "system", content: system }, { role: "user", content: userText }];
  const tools = isCustomer ? CUSTOMER_TOOLS : TOOLS;

  return runWithCustomerConfig(ALAA_CUSTOMER_ID, async () => {
    for (let i = 0; i < 5; i++) {
      const resp = await invokeAgentLLM({ messages: messages as never, tools: tools as never, tool_choice: "auto", max_tokens: 1200 });
      const msg = resp?.choices?.[0]?.message;
      if (!msg) return UNUSABLE_REPLY_FALLBACK;
      if (!msg.tool_calls?.length) {
        const text = sanitizeReply(typeof msg.content === "string" ? msg.content : "");
        await deductCredits(ALAA_CUSTOMER_ID, MESSAGE_COST);
        return isUsableReply(text) ? text : UNUSABLE_REPLY_FALLBACK;
      }
      messages.push({ role: "assistant", content: "", tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls as Array<{ id?: string; function: { name: string; arguments: string } }>) {
        const tcId = tc.id ?? `c${i}`;
        let out: string;
        try {
          const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          out = isCustomer
            ? await runCustomerTool(tc.function.name, args, who.erpCustomer ?? "")
            : JSON.stringify((await executeTool(tc.function.name, args)).result);
        } catch (e) {
          out = JSON.stringify({ error: e instanceof Error ? e.message : "فشل" });
        }
        messages.push({ role: "tool", content: out, tool_call_id: tcId });
      }
    }
    return UNUSABLE_REPLY_FALLBACK;
  });
}

async function createIssue(text: string, who: { name: string; erpCustomer?: string }, email: string): Promise<string | null> {
  const subject = text.split("\n")[0].slice(0, 100) || "بلاغ من تليجرام";
  const res = await erpFetch(`/api/resource/Issue`, {
    method: "POST",
    body: JSON.stringify({
      subject,
      raised_by: email,
      ...(who.erpCustomer ? { customer: who.erpCustomer } : {}),
      description: `${text}\n\n—\nوصل عبر بوت تليجرام من: ${who.name} (${email})`,
    }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { data?: { name?: string } }).data?.name ?? null;
}

async function notifyStaff(text: string) {
  const staffChats = await db.select().from(schema.alaaTgUsers).where(eq(schema.alaaTgUsers.kind, "staff"));
  const targets = new Set<string>([OWNER_CHAT, ...staffChats.filter(s => s.verifiedAt).map(s => s.chatId)]);
  for (const c of targets) await say(c, text).catch(() => {});
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TG_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const chatIdNum = update?.message?.chat?.id;
  const text = (update?.message?.text ?? "").trim();
  if (!chatIdNum || !text) return NextResponse.json({ ok: true });
  const chatId = String(chatIdNum);

  try {
    const rows = await db.select().from(schema.alaaTgUsers).where(eq(schema.alaaTgUsers.chatId, chatId)).limit(1);
    const u = rows[0];

    if (text === "/start" || !u) {
      await upsertTg(chatId, { mode: "chat" });
      await say(chatId, `أهلاً ${update?.message?.from?.first_name ?? ""} 👋\nأنا ألاء — مساعدة Horizon الذكية.\n\nللبدء اكتب إيميلك المسجل عندنا، وهيوصلك رمز دخول عليه.`);
      return NextResponse.json({ ok: true });
    }

    if (!u.verifiedAt) {
      if (EMAIL_RE.test(text)) {
        const email = text.toLowerCase();
        const identity = await lookupIdentity(email);
        if (!identity) {
          await say(chatId, "الإيميل ده مش مسجل عندنا — اتأكد منه أو تواصل مع فريق Horizon.");
          return NextResponse.json({ ok: true });
        }
        const code = String(randomInt(100000, 999999));
        const sent = await sendOtpEmail(email, code);
        if (!sent) {
          await say(chatId, "تعذّر إرسال الرمز حاليًا — جرّب بعد دقيقة.");
          return NextResponse.json({ ok: true });
        }
        await upsertTg(chatId, {
          email, kind: identity.kind, erpCustomer: identity.erpCustomer ?? null,
          displayName: identity.name, otpHash: otpHashOf(code, chatId),
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), verifiedAt: null,
        });
        await say(chatId, `بعتنا رمزًا من ٦ أرقام على ${email} — اكتبه هنا خلال ١٠ دقايق.`);
        return NextResponse.json({ ok: true });
      }
      if (/^\d{6}$/.test(text) && u.otpHash) {
        const expired = !u.otpExpiresAt || new Date(u.otpExpiresAt) < new Date();
        if (expired || otpHashOf(text, chatId) !== u.otpHash) {
          await say(chatId, expired ? "الرمز انتهت صلاحيته — ابعت إيميلك تاني." : "الرمز غير صحيح — جرّب تاني.");
          return NextResponse.json({ ok: true });
        }
        await upsertTg(chatId, { verifiedAt: new Date().toISOString(), otpHash: null, otpExpiresAt: null, mode: "chat" });
        const role = u.kind === "staff" ? "أهلاً بيك في فريق Horizon 💼" : `أهلاً بحضرتك — حساب «${u.displayName}»`;
        await say(chatId, `تم التحقق ✅ ${role}\n\nاسألني عن بياناتك مباشرة، أو دوس «${REPORT_BTN}» لتسجيل شكوى/بلاغ يوصل الفريق فورًا.`, true);
        return NextResponse.json({ ok: true });
      }
      await say(chatId, "اكتب إيميلك المسجل الأول عشان أبعتلك رمز الدخول.");
      return NextResponse.json({ ok: true });
    }

    // ─── موثَّق ───
    if (text === REPORT_BTN || text === "/report") {
      await upsertTg(chatId, { mode: "report" });
      await say(chatId, "اكتب بلاغك في رسالة واحدة (المشكلة + أي تفاصيل تساعدنا)، وهيتسجل فورًا برقم متابعة.");
      return NextResponse.json({ ok: true });
    }
    if (text === CHAT_BTN) {
      await upsertTg(chatId, { mode: "chat" });
      await say(chatId, "اتفضل اسأل 👌", true);
      return NextResponse.json({ ok: true });
    }

    if (u.mode === "report") {
      const issue = await createIssue(text, { name: u.displayName ?? "", erpCustomer: u.erpCustomer ?? undefined }, u.email ?? "");
      await upsertTg(chatId, { mode: "chat" });
      if (!issue) {
        await say(chatId, "تعذّر تسجيل البلاغ — جرّب تاني أو كلمنا مباشرة.", true);
        return NextResponse.json({ ok: true });
      }
      await say(chatId, `اتسجل بلاغك برقم ${issue} ✅ الفريق هيتواصل معاك قريبًا.`, true);
      await notifyStaff(`🔔 بلاغ جديد ${issue}\nمن: ${u.displayName} (${u.email})\n\n${text.slice(0, 500)}`);
      return NextResponse.json({ ok: true });
    }

    const answer = await alaaAnswer(text, { kind: u.kind ?? "customer", name: u.displayName ?? "", erpCustomer: u.erpCustomer ?? undefined });
    await say(chatId, answer, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tg-webhook]", e instanceof Error ? e.message : e);
    await say(chatId, "حصل خطأ مؤقت — جرّب تاني.").catch(() => {});
    return NextResponse.json({ ok: true });
  }
}
