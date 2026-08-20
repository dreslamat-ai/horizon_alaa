// ─── نقطة محادثة "ألاء" ──────────────────────────────────────────────────────
// حلقة استدعاء الأدوات مبسَّطة عن almoaser-dev/server/routers/agent.ts
// (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦، سطور ٢٦٣-٤٥٦) — نفس البنية (حلقة حتى ٨ مرات،
// invokeAgentLLM بالأدوات، تنفيذ tool_calls، verifyReply قبل التسليم)
// بلا نظام النقاط/الصلاحيات/المنصات (يُضاف في مراحل لاحقة حسب الخطة).
import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/session";
import { runWithFixedConfig } from "@/lib/erp/erpClient";
import { modeRules, identityLine } from "@/lib/agent/agentModes";
import { TOOLS } from "@/lib/agent/toolDefinitions";
import { executeTool } from "@/lib/agent/executeTool";
import { invokeAgentLLM } from "@/lib/llm/llmProvider";
import { outcomeOf, verifyReply, summarizeOutcomes, type ToolOutcome } from "@/lib/agent/outcomeGuard";

type ChatMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

const MAX_ITER = 8;

export async function POST(req: NextRequest) {
  const staff = await requireStaffSession(req);
  if (!staff) return NextResponse.json({ error: "لازم تسجّل دخولك أولاً" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { messages?: ChatMessage[] } | null;
  if (!body?.messages?.length) return NextResponse.json({ error: "الرسائل مطلوبة" }, { status: 400 });

  const systemPrompt = `${identityLine}\n\n${modeRules()}`;
  const llmMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...body.messages,
  ];

  const outcomes: ToolOutcome[] = [];
  const toolResults: Array<{ tool_name: string; display: string }> = [];

  try {
    return await runWithFixedConfig(async () => {
      for (let iter = 0; iter < MAX_ITER; iter++) {
        const response = await invokeAgentLLM({
          messages: llmMessages,
          tools: [...TOOLS],
          tool_choice: "auto",
          max_tokens: 2000,
        });

        const msg = response?.choices?.[0]?.message;
        if (!msg) {
          return NextResponse.json({ error: "أعاد النموذج استجابة فارغة — حاول تاني" }, { status: 502 });
        }

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          const rawText = typeof msg.content === "string" ? msg.content : "";
          const verdict = verifyReply(rawText, outcomes);
          const replyText = verdict.ok ? rawText : verdict.replacement;
          return NextResponse.json({ reply: replyText, toolResults });
        }

        llmMessages.push({
          role: "assistant",
          content: "",
          tool_calls: msg.tool_calls,
        });

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
      return NextResponse.json({ reply: fallbackReply, toolResults });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطأ غير متوقع";
    console.error("[alaa/chat]", message);
    return NextResponse.json({ error: `عذراً، حصل عطل: ${message}` }, { status: 500 });
  }
}
