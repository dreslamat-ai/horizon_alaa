// ─── مزوّد النموذج الذكي — نسخة مبسّطة ────────────────────────────────────────
// منقولة بتصرّف من almoaser-dev/server/llmProvider.ts (قُرئت ١٩-٢٠ أغسطس
// ٢٠٢٦). الفرق: هناك ثلاث طبقات fallback (OpenRouter → OpenAI → نموذج
// مدمج خاص بمنصة المعاصر). الطبقة الثالثة غير موجودة هنا (لا اقتران وقت
// تشغيل مع almoaser-ai) — OpenRouter ثم OpenAI فقط.

type ChatMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string };
type ToolDef = { type: "function"; function: { name: string; description: string; parameters: unknown } };

export type InvokeParams = {
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: unknown;
  max_tokens?: number;
};

export type InvokeResult = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown[] }; finish_reason?: string }>;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 25_000);

const DEFAULT_OPENROUTER_MODELS = [
  "deepseek/deepseek-v4-flash",
  "qwen/qwen3.5-397b-a17b",
];

function getOpenRouterModels(): string[] {
  const raw = process.env.LLM_MODEL?.trim();
  if (!raw) return DEFAULT_OPENROUTER_MODELS;
  const list = raw.split(",").map(m => m.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_OPENROUTER_MODELS;
}

function assertNonEmptyReply(parsed: InvokeResult, label: string): void {
  const choice = parsed.choices?.[0];
  if (choice?.message?.tool_calls?.length) return;
  const content = choice?.message?.content;
  const empty = content === null || content === undefined || (typeof content === "string" && content.trim() === "");
  if (empty) throw new Error(`${label} أعاد رداً فارغاً (finish_reason=${choice?.finish_reason ?? "?"})`);
}

function buildPayload(params: InvokeParams, model: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { model, messages: params.messages };
  if (params.tools?.length) {
    payload.tools = params.tools;
    if (params.tool_choice) payload.tool_choice = params.tool_choice;
  }
  if (typeof params.max_tokens === "number") payload.max_tokens = params.max_tokens;
  return payload;
}

async function invokeOpenRouterModel(params: InvokeParams, apiKey: string, model: string): Promise<InvokeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildPayload(params, model)),
    });
  } catch (e) {
    throw (e as Error)?.name === "AbortError"
      ? new Error(`OpenRouter (${model}) تجاوز المهلة ${Math.round(MODEL_TIMEOUT_MS / 1000)}ث`)
      : e;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenRouter invoke failed (${model}): ${response.status} ${response.statusText} - ${errorText.slice(0, 300)}`);
  }
  const parsed = (await response.json()) as InvokeResult;
  assertNonEmptyReply(parsed, `OpenRouter (${model})`);
  return parsed;
}

async function invokeOpenAI(params: InvokeParams, apiKey: string): Promise<InvokeResult> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildPayload(params, OPENAI_MODEL)),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI invoke failed: ${response.status} ${response.statusText} - ${errorText.slice(0, 300)}`);
  }
  const parsed = (await response.json()) as InvokeResult;
  assertNonEmptyReply(parsed, "OpenAI");
  return parsed;
}

export async function invokeAgentLLM(params: InvokeParams): Promise<InvokeResult & { _provider: string }> {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    let lastError: unknown;
    for (const model of getOpenRouterModels()) {
      try {
        const result = await invokeOpenRouterModel(params, openRouterKey, model);
        return { ...result, _provider: `openrouter:${model}` };
      } catch (error) {
        lastError = error;
        console.warn(`[llmProvider] OpenRouter model ${model} failed:`, error instanceof Error ? error.message : String(error));
      }
    }
    console.warn("[llmProvider] OpenRouter (all models) failed, falling back to OpenAI:", lastError instanceof Error ? lastError.message : String(lastError));
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    const result = await invokeOpenAI(params, openAiKey);
    return { ...result, _provider: "openai" };
  }

  throw new Error("لا يوجد مفتاح OPENROUTER_API_KEY ولا OPENAI_API_KEY مضبوط");
}
