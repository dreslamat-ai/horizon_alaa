// ─── نقطة محادثة "ألاء" — مرحلة ٢: عميل مختار + إنفاذ اشتراك/نقاط ────────────
// حلقة استدعاء الأدوات مبسَّطة عن almoaser-dev/server/routers/agent.ts
// (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦). الإضافة عن مرحلة ١: assertAlaaAccessAllowed
// يُستدعى أولًا (قبل أي استدعاء لنموذج اللغة)، وrunWithCustomerConfig
// يبني الاتصال من alaa_customers بدل env ثابت.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAnySession } from "@/lib/auth/session";
import { runWithCustomerConfig } from "@/lib/erp/erpClient";
import { assertAlaaAccessAllowed, deductCredits, MESSAGE_COST } from "@/lib/credits";
import { modeRules, identityLine, toolsForPlan, PLANS_ENFORCED } from "@/lib/agent/agentModes";
import { TOOLS } from "@/lib/agent/toolDefinitions";
import { narrowToolsByErpPermissions } from "@/lib/agent/toolPermissions";
import { executeTool } from "@/lib/agent/executeTool";
import { invokeAgentLLM } from "@/lib/llm/llmProvider";
import { outcomeOf, verifyReply, summarizeOutcomes, type ToolOutcome } from "@/lib/agent/outcomeGuard";
import { isUsableReply, sanitizeReply, UNUSABLE_REPLY_FALLBACK } from "@/lib/agent/replyGuard";

type ChatMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

const MAX_ITER = 8;

export async function POST(req: NextRequest) {
  const session = await requireAnySession(req);
  if (!session) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { customerId?: number; messages?: ChatMessage[] } | null;
  // جلسة المستأجر مقفولة بنيويًا على عميلها — ما يبعته المتصفح يُتجاهل
  // تمامًا، فتزوير customerId في الطلب لا يفتح بيانات عميل آخر أصلاً.
  const customerId = session.kind === "customer" ? session.customerId : body?.customerId;
  if (!customerId) return NextResponse.json({ error: "لازم تختار عميل أولاً" }, { status: 400 });
  if (!body?.messages?.length) return NextResponse.json({ error: "الرسائل مطلوبة" }, { status: 400 });

  // ─── الفحص الحاسم: قبل أي استدعاء لنموذج اللغة، لا بعده ───────────────────
  const access = await assertAlaaAccessAllowed(customerId);
  if (!access.ok) {
    const status = access.reason === "not_found" ? 404 : access.reason === "credits_exhausted" ? 402 : 403;
    const message = access.reason === "credits_exhausted" && session.kind === "customer"
      ? "رصيدك من نقاط ألاء خلص — اشحن من صفحة «اشتراكي والفواتير» في نظامك وهرجع أرد عليك فورًا 🌟"
      : access.message;
    return NextResponse.json({ error: message, reason: access.reason }, { status });
  }
  const customer = access.customer;

  // علم الكتابة من الباقة — نفس نمط سارة: القدرة قدرة اشتراك، والفشل في
  // قراءتها يسقط للأضيق (قراءة فقط) لا للأوسع، لأن الكتابة أخطر من حرمانها.
  // جلسة المستأجر تُنفَّذ عليها الباقة دائمًا (بغضّ النظر عن PLANS_ENFORCED
  // العام) — العلم العام يخصّ موظفي Horizon وحدهم بقرار المالك ٢٤ أغسطس.
  const planEnforced = PLANS_ENFORCED || session.kind === "customer";
  let allowWrites = true;
  if (planEnforced) try {
    const [plan] = await db.select().from(schema.alaaPlans).where(eq(schema.alaaPlans.id, customer.planId)).limit(1);
    allowWrites = plan?.allowWrites ?? false;
  } catch { allowWrites = false; }
  if (!planEnforced) allowWrites = true;

  const systemPrompt = `${identityLine}\n\nالعميل الحالي الذي تخدمينه: **${customer.companyNameAr}**.\n\n${modeRules(allowWrites)}`;
  const llmMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...body.messages,
  ];

  const outcomes: ToolOutcome[] = [];
  const toolResults: Array<{ tool_name: string; display: string }> = [];

  try {
    return await runWithCustomerConfig(customer.id, async () => {
      // مرة واحدة قبل الحلقة — طبقة إرشادية (لا حاجز أمني)، تمنع النموذج
      // من "وعد" الموظف بأداة سيرفضها ERPNext لاحقًا بخطأ صلاحيات.
      const availableTools = await narrowToolsByErpPermissions(toolsForPlan([...TOOLS], allowWrites));
      for (let iter = 0; iter < MAX_ITER; iter++) {
        const response = await invokeAgentLLM({
          messages: llmMessages,
          tools: availableTools,
          tool_choice: "auto",
          max_tokens: 2000,
        });

        const msg = response?.choices?.[0]?.message;
        if (!msg) {
          return NextResponse.json({ error: "أعاد النموذج استجابة فارغة — حاول تاني" }, { status: 502 });
        }

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          const rawText = sanitizeReply(typeof msg.content === "string" ? msg.content : "");
          const verdict = verifyReply(rawText, outcomes);
          let replyText = verdict.ok ? rawText : verdict.replacement;
          if (!isUsableReply(replyText)) replyText = UNUSABLE_REPLY_FALLBACK;
          // الخصم بعد نجاح الرد فقط — لا قبل، ولا عند فشل النموذج
          await deductCredits(customer.id, MESSAGE_COST, session.kind === "staff" ? session.id : undefined);
          return NextResponse.json({ reply: replyText, toolResults, creditsBalance: customer.creditsBalance - MESSAGE_COST });
        }

        llmMessages.push({ role: "assistant", content: "", tool_calls: msg.tool_calls });

        for (const tc of msg.tool_calls as Array<{ id?: string; index?: number; function: { name: string; arguments: string } }>) {
          const tcId = tc.id ?? `call_${tc.index ?? Math.random().toString(36).slice(2)}`;
          let toolResult: string;
          let display = "";
          try {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            const out = await executeTool(tc.function.name, args);
            toolResult = JSON.stringify(out.result);
            display = out.display;
          } catch (e) {
            const rawErr = e instanceof Error ? e.message : "فشل تنفيذ الأداة";
            toolResult = JSON.stringify({ error: rawErr });
          }
          toolResults.push({ tool_name: tc.function.name, display });
          outcomes.push(outcomeOf(tc.function.name, toolResult));
          llmMessages.push({ role: "tool", content: toolResult, tool_call_id: tcId });
        }
      }

      const fallbackReply = summarizeOutcomes(outcomes);
      await deductCredits(customer.id, MESSAGE_COST);
      return NextResponse.json({ reply: fallbackReply, toolResults, creditsBalance: customer.creditsBalance - MESSAGE_COST });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطأ غير متوقع";
    console.error("[alaa/chat]", message);
    return NextResponse.json({ error: `عذراً، حصل عطل: ${message}` }, { status: 500 });
  }
}
