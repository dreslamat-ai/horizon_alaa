"use client";

// ─── واجهة "ألاء" — زر عائم + لوحة منزلقة ─────────────────────────────────────
// مستوحاة من resources/views/partials/shahd_widget.blade.php في مستودع
// almoaser-site (قُرئت ١٩ أغسطس ٢٠٢٦) — نفس الشكل والحركة، بهوية Horizon
// بدل هوية شهد، وبناءً كمكوّن React بدل vanilla JS (التطبيق مضبوط بالكامل
// من Horizon هنا، لا حاجة لعزل Shadow DOM كما في تصميم widget خارجي).
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "error"; content: string };

const STARTERS = ["اعرضلي آخر ١٠ فواتير", "دور على موظف باسمه", "قائمة العملاء"];

export default function AlaaWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setShowChips(false);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role === "error" ? "assistant" : m.role, content: m.content })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok) {
        setMessages(m => [...m, { role: "error", content: data.error ?? "حصل خطأ. جرّب تاني." }]);
        return;
      }
      setMessages(m => [...m, { role: "assistant", content: data.reply ?? "" }]);
    } catch {
      setMessages(m => [...m, { role: "error", content: "مش قادرة أوصل للسيرفر. اطمن على الاتصال." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="تحدّث مع ألاء"
        className="fixed bottom-5 z-50 w-14 h-14 rounded-full bg-[#1D2D44] text-white shadow-lg flex items-center justify-center text-xl font-bold hover:bg-[#16233590] transition"
        style={{ insetInlineEnd: "20px" }}
      >
        أ
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="محادثة ألاء"
          className="fixed bottom-24 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[520px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ insetInlineEnd: "20px" }}
        >
          <div className="bg-[#1D2D44] text-white px-3.5 py-3 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">أ</div>
            <div className="flex-1">
              <b className="block text-[15px] leading-tight">ألاء</b>
              <small className="opacity-75 text-[11.5px]">مساعدة Horizon الذكية</small>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="text-white text-xl leading-none px-1"
            >
              ×
            </button>
          </div>

          <div ref={logRef} className="flex-1 overflow-y-auto p-3.5 bg-[#f6f8fb] flex flex-col gap-2.5">
            {messages.length === 0 && (
              <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white border border-[#e6eaf1] px-3 py-2.5 text-[#1D2D44] leading-relaxed">
                أهلاً 👋 أنا ألاء. اسألني عن أي بيانات في نظام العميل وأجيبك فورًا.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  "max-w-[85%] rounded-2xl px-3 py-2.5 leading-relaxed whitespace-pre-wrap " +
                  (m.role === "user"
                    ? "bg-[#1D2D44] text-white self-end rounded-se-sm"
                    : m.role === "error"
                      ? "bg-[#fdeaea] text-[#a33] border border-[#f5c6c6]"
                      : "bg-white text-[#1D2D44] border border-[#e6eaf1] rounded-ss-sm")
                }
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white border border-[#e6eaf1] px-3 py-2.5 flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9aa6bd] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#9aa6bd] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#9aa6bd] animate-bounce [animation-delay:300ms]" />
              </div>
            )}
          </div>

          {showChips && messages.length === 0 && (
            <div className="px-3.5 pb-2.5 flex flex-wrap gap-1.5 bg-[#f6f8fb]">
              {STARTERS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => send(t)}
                  className="border border-[#cfd7e4] bg-white text-[#1D2D44] rounded-full px-3 py-1.5 text-xs hover:bg-[#eef2f8]"
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            className="shrink-0 border-t border-[#e6eaf1] p-2.5 flex gap-2 bg-white"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="اكتب رسالتك…"
              maxLength={1500}
              className="flex-1 border border-[#dfe4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1D2D44]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="إرسال"
              className="w-11 rounded-lg bg-[#1D2D44] text-white text-lg disabled:opacity-50"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
