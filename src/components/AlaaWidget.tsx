"use client";

// ─── واجهة "ألاء" — زر عائم + لوحة منزلقة ─────────────────────────────────────
// مستوحاة من resources/views/partials/shahd_widget.blade.php (almoaser-site،
// قُرئت ١٩ أغسطس ٢٠٢٦). مرحلة ٢: اختيار "العميل الحالي" قبل بدء المحادثة
// (خطة "ألاء" القسم ٣/٧) — كل رسالة تُرسَل باسم عميل محدد، والرصيد يُعرض
// في الرأس فيراه الموظف قبل ما ينفد لا بعده.
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiPath";

type Msg = { role: "user" | "assistant" | "error"; content: string };
type Customer = { id: number; companyNameAr: string; subscriptionStatus: string; creditsBalance: number };

const STARTERS = ["اعرضلي أسماء الموظفين", "دور على عميل باسمه", "قائمة الأصناف"];

export default function AlaaWidget() {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/customers`)
      .then(r => r.json())
      .then((data: { customers?: Customer[] }) => setCustomers(data.customers ?? []));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  // تغيير العميل يبدأ محادثة جديدة — سياق عميل سابق لا يجوز أن يُكمَل مع
  // عميل آخر، حتى بالخطأ.
  function switchCustomer(id: number) {
    setCustomerId(id);
    setMessages([]);
    setShowChips(true);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || !customerId) return;
    setShowChips(false);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          messages: next.map(m => ({ role: m.role === "error" ? "assistant" : m.role, content: m.content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; creditsBalance?: number };
      if (!res.ok) {
        setMessages(m => [...m, { role: "error", content: data.error ?? "حصل خطأ. جرّب تاني." }]);
        return;
      }
      setMessages(m => [...m, { role: "assistant", content: data.reply ?? "" }]);
      if (typeof data.creditsBalance === "number") {
        setCustomers(cs => cs.map(c => c.id === customerId ? { ...c, creditsBalance: data.creditsBalance! } : c));
      }
    } catch {
      setMessages(m => [...m, { role: "error", content: "مش قادرة أوصل للسيرفر. اطمن على الاتصال." }]);
    } finally {
      setBusy(false);
    }
  }

  const currentCustomer = customers.find(c => c.id === customerId);

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
          className="fixed bottom-24 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ insetInlineEnd: "20px" }}
        >
          <div className="bg-[#1D2D44] text-white px-3.5 py-3 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">أ</div>
            <div className="flex-1">
              <b className="block text-[15px] leading-tight">ألاء</b>
              <small className="opacity-75 text-[11.5px]">مساعدة Horizon الذكية</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="text-white text-xl leading-none px-1">
              ×
            </button>
          </div>

          <div className="shrink-0 border-b border-[#e6eaf1] px-3.5 py-2.5 bg-[#f6f8fb] flex flex-col gap-1.5">
            <label className="text-xs text-gray-600">العميل الذي تخدمه الآن</label>
            <select
              value={customerId ?? ""}
              onChange={e => switchCustomer(Number(e.target.value))}
              className="border border-[#dfe4ec] rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="" disabled>اختر عميلاً…</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.companyNameAr}</option>
              ))}
            </select>
            {currentCustomer && (
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>رصيد النقاط: <b className="text-[#1D2D44]">{currentCustomer.creditsBalance}</b></span>
                <span>{currentCustomer.subscriptionStatus === "active" ? "🟢 نشط" : currentCustomer.subscriptionStatus}</span>
              </div>
            )}
          </div>

          <div ref={logRef} className="flex-1 overflow-y-auto p-3.5 bg-[#f6f8fb] flex flex-col gap-2.5">
            {!customerId && (
              <div className="text-center text-sm text-gray-400 mt-8">اختر عميلاً من فوق عشان تبدأ</div>
            )}
            {customerId && messages.length === 0 && (
              <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white border border-[#e6eaf1] px-3 py-2.5 text-[#1D2D44] leading-relaxed">
                أهلاً 👋 أنا ألاء. اسألني عن أي بيانات في نظام {currentCustomer?.companyNameAr} وأجيبك فورًا.
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

          {showChips && customerId && messages.length === 0 && (
            <div className="px-3.5 pb-2.5 flex flex-wrap gap-1.5 bg-[#f6f8fb]">
              {STARTERS.map(t => (
                <button key={t} type="button" onClick={() => send(t)} className="border border-[#cfd7e4] bg-white text-[#1D2D44] rounded-full px-3 py-1.5 text-xs hover:bg-[#eef2f8]">
                  {t}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); send(input); }} className="shrink-0 border-t border-[#e6eaf1] p-2.5 flex gap-2 bg-white">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={customerId ? "اكتب رسالتك…" : "اختر عميلاً أولاً"}
              maxLength={1500}
              disabled={!customerId}
              className="flex-1 border border-[#dfe4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1D2D44] disabled:bg-gray-50"
            />
            <button type="submit" disabled={busy || !input.trim() || !customerId} aria-label="إرسال" className="w-11 rounded-lg bg-[#1D2D44] text-white text-lg disabled:opacity-50">
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
