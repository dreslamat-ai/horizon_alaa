"use client";

// ─── واجهة "ألاء" — زر عائم + لوحة منزلقة ─────────────────────────────────────
// مستوحاة من resources/views/partials/shahd_widget.blade.php (almoaser-site،
// قُرئت ١٩ أغسطس ٢٠٢٦).
//
// 🔴 مراجَعة جوهرية (٢١ أغسطس) بطلب صريح من المالك بعد رفض قاطع لتصميم
// "اختيار عميل" السابق: "زي شهد يا غبي زي سارة" — لا واجهة اختيار
// إطلاقًا. كل site (subdomain) مرتبط بعميل واحد عبر erpUrl، فالهوية
// تُعرَف صامتة من مكان فتح الودجت لا من اختيار داخل المحادثة. اسم
// العميل ورصيده وحالته يُعرَضون تلقائيًا (طلب صريح آخر: "في رصيد ونقاط
// واسم عميل يا غبي")، لكن بلا أي <select> أو قائمة يتفاعل معها أحد.
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiPath";

type Msg = { role: "user" | "assistant" | "error"; content: string };
type Customer = { id: number; companyNameAr: string; subscriptionStatus: string; creditsBalance: number; erpUrl?: string };

const STARTERS = ["اعرضلي أسماء الموظفين", "دور على عميل باسمه", "قائمة الأصناف"];

/**
 * تنسيق ماركداون محدود بعد التهريب — منقولة بتصرّف من fmt() في
 * shahd_widget.blade.php (almoaser-site). كانت غائبة تمامًا هنا: ردود
 * النموذج تحمل ماركداون بطبعها (جداول، **تشديد**)، وكانت تظهر خامًا
 * («**كل المبيعات**» حرفيًا) — نفس عطل شهد الموثَّق (٢٦ من ١٠٥ ردًا).
 * التهريب أولاً ثم الاستبدال، لا العكس — وإلا نجا HTML من رسالة مستخدم.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * رابط ماركداون [نص](رابط) — لروابط تحميل PDF فقط. مقبول عمدًا: مسار
 * نسبي يبدأ بـ/api/invoice-pdf? بالضبط، لا أي رابط آخر — النموذج قد
 * يكتب رابطًا خارجيًا لو تُرك بلا قيد (نفس منطق extractGoto في شهد: لا
 * يُقبل إلا مسار داخلي معروف). حروف المنطقة الخاصة (Private Use Area،
 * لا تقع أبدًا في نص حقيقي) هي الفاصل المؤقّت بين النص والرابط — مسافة
 * عادية كانت ستنكسر لأن نص الزر يحتوي مسافات فعلاً.
 */
// علامة + مقبولة لأن URLSearchParams يرمّز المسافة بها (doctype=Sales+Invoice)
// — غيابها كان يُسقط كل رابط فاتورة فعلي. والبادئة /alaa اختيارية هنا
// لأن الموديل قد يكتب الرابط بها أو بدونها، وتُطبَّع دائمًا قبل العرض.
const SAFE_LINK_RE = /^(?:\/alaa)?\/api\/invoice-pdf\?[A-Za-z0-9_=&%.+\-]{1,300}$/;
const BARE_LINK_RE = /(?:\/alaa)?\/api\/invoice-pdf\?[A-Za-z0-9_=&%.+\-]{1,300}/g;
const withAlaaPrefix = (href: string) => (href.startsWith("/alaa/") ? href : `/alaa${href}`);
const SEP1 = "";
const SEP2 = "";
const SEP3 = "";

/** سطر أو نص عادي بعد التهريب — بلا معالجة جداول (تُعالَج على مستوى الفقرة) */
function formatInline(s: string): string {
  let linkified = s.replace(/\[([^\]\n]{1,120})\]\(([^)\n]{1,300})\)/g, (_m, text: string, href: string) => {
    if (!SAFE_LINK_RE.test(href)) return text; // رابط غير موثوق ⇐ النص وحده بلا رابط
    return `${SEP1}${text}${SEP2}${withAlaaPrefix(href)}${SEP3}`;
  });
  // رابط خام بلا صيغة ماركداون — الموديلات المجانية بتكتبه نصًّا كثيرًا
  // (بلاغ حي بلقطة شاشة: رابط مبعثر غير قابل للضغط). يتحوّل لزرار تحميل.
  // شرط "ليس بعد فاصل SEP2" يمنع إعادة التقاط روابط الماركداون المحوَّلة فوق.
  linkified = linkified.replace(BARE_LINK_RE, (m: string, offset: number, full: string) =>
    full[offset - 1] === SEP2 ? m : `${SEP1}⬇ تحميل الفاتورة PDF${SEP2}${withAlaaPrefix(m)}${SEP3}`);
  let h = escapeHtml(linkified);
  const linkRe = new RegExp(`${SEP1}([^${SEP2}]*)${SEP2}([^${SEP3}]*)${SEP3}`, "g");
  h = h.replace(linkRe, (_m, text: string, href: string) =>
    `<a href="${href}" target="_blank" rel="noopener" class="inline-block my-1 px-3 py-1.5 rounded-lg bg-[#1D2D44] text-white font-semibold no-underline">${text}</a>`);
  h = h.replace(/^\s*#{1,4}\s*(.+)$/gm, '<b class="block mt-2 mb-1 first:mt-0">$1</b>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/^\s*[-*·]\s+/gm, "• ");
  h = h.replace(/\n/g, "<br>");
  return h;
}

const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

function splitTableCells(row: string): string[] {
  return row.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

/**
 * جداول ماركداون (| عمود | عمود |) — كانت تظهر رموزًا خامًا مبعثرة
 * («تنسيق المحادثة زبالة»، بلاغ حي من المالك). ردود النموذج تحمل جداولاً
 * حقيقية دائمًا تقريبًا (قوائم فواتير، أصناف)، لا مجرد فقرات نصية.
 */
function formatMessage(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const header = splitTableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        rows.push(splitTableCells(lines[i]));
        i++;
      }
      const thead = header.map(c => `<th class="border border-[#e6eaf1] px-2 py-1 bg-[#f6f8fb] text-start">${escapeHtml(c)}</th>`).join("");
      const tbody = rows.map(r =>
        `<tr>${r.map(c => `<td class="border border-[#e6eaf1] px-2 py-1">${escapeHtml(c)}</td>`).join("")}</tr>`
      ).join("");
      out.push(`<table class="w-full text-xs my-1.5 border-collapse"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`);
      continue;
    }
    out.push(formatInline(line));
    i++;
  }
  return out.join("<br>").replace(/(<br>)*(<table)/g, "$2").replace(/(<\/table>)(<br>)*/g, "$1");
}

// جوّا iframe (زرّ desk في horizon_desk_theme بيحمّل الصفحة الرئيسية
// كاملة داخل لوحته المنزلقة الخاصة) — الزر العائم هنا مكرَّر بلا فائدة،
// فاللوحة تُفتَح تلقائيًا وتملأ المساحة، والزرّ يختفي.
function isEmbeddedInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.self !== window.top; } catch { return true; }
}

export default function AlaaWidget() {
  const [open, setOpen] = useState(isEmbeddedInIframe);
  const embedded = isEmbeddedInIframe();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false); // يفرّق "لسه بيحمّل" عن "مفيش تطابق فعلاً"
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/customers`)
      .then(r => r.json())
      .then((data: { customers?: Customer[] }) => {
        const list = data.customers ?? [];
        setCustomers(list);
        // site معروف من مكان فتح الزر (زي e.horizonerp.cloud) — هو
        // المصدر الوحيد لتحديد العميل، بلا أي اختيار من المستخدم.
        // window.location.search لا useSearchParams عمدًا: يتفادى
        // الحاجة لـSuspense boundary هنا.
        const site = new URLSearchParams(window.location.search).get("site");
        const matches = site ? list.filter(c => c.erpUrl?.includes(site)) : [];
        if (matches.length === 1) setCustomerId(matches[0].id);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

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
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label="تحدّث مع ألاء"
          className="fixed bottom-5 z-50 w-14 h-14 rounded-full overflow-hidden shadow-lg hover:opacity-90 transition"
          style={{ insetInlineEnd: "20px" }}
        >
          <img src={`${API_BASE}/alaa-avatar.png`} alt="" className="w-full h-full object-cover" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="محادثة ألاء"
          className={embedded
            ? "fixed inset-0 z-50 bg-white flex flex-col overflow-hidden"
            : "fixed bottom-24 z-50 w-[360px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"}
          style={embedded ? undefined : { insetInlineEnd: "20px" }}
        >
          <div className="bg-[#1D2D44] text-white px-3.5 py-3 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
              <img src={`${API_BASE}/alaa-avatar.png`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <b className="block text-[15px] leading-tight">ألاء</b>
              <small className="opacity-75 text-[11.5px]">مساعدة Horizon الذكية</small>
            </div>
            {!embedded && (
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="text-white text-xl leading-none px-1">
                ×
              </button>
            )}
          </div>

          {currentCustomer && (
            <div className="shrink-0 border-b border-[#e6eaf1] px-3.5 py-2.5 bg-[#f6f8fb] flex flex-col gap-1.5">
              <div className="text-sm font-semibold text-[#1D2D44]">{currentCustomer.companyNameAr}</div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>رصيد النقاط: <b className="text-[#1D2D44]">{currentCustomer.creditsBalance}</b></span>
                <span>{currentCustomer.subscriptionStatus === "active" ? "🟢 نشط" : currentCustomer.subscriptionStatus}</span>
              </div>
            </div>
          )}

          <div ref={logRef} className="flex-1 overflow-y-auto p-3.5 bg-[#f6f8fb] flex flex-col gap-2.5">
            {loaded && !customerId && (
              <div className="text-center text-sm text-gray-400 mt-8">مفيش اشتراك مفعَّل لهذا الموقع — تواصل مع إدارة Horizon</div>
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
                  "max-w-[85%] rounded-2xl px-3 py-2.5 leading-relaxed " +
                  (m.role === "assistant" ? "" : "whitespace-pre-wrap ") +
                  (m.role === "user"
                    ? "bg-[#1D2D44] text-white self-end rounded-se-sm"
                    : m.role === "error"
                      ? "bg-[#fdeaea] text-[#a33] border border-[#f5c6c6]"
                      : "bg-white text-[#1D2D44] border border-[#e6eaf1] rounded-ss-sm")
                }
                {...(m.role === "assistant"
                  ? { dangerouslySetInnerHTML: { __html: formatMessage(m.content) } }
                  : { children: m.content })}
              />
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
              placeholder={customerId ? "اكتب رسالتك…" : "مفيش اشتراك مفعَّل"}
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
