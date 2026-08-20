"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/apiPath";

type Customer = {
  id: number; companyNameAr: string; companyNameEn: string | null;
  erpUrl: string; erpUsername: string; subscriptionStatus: string;
  subscriptionEndDate: string; creditsBalance: number; monthlyCreditsAllowance: number;
};

const STATUSES = [
  { value: "trial", label: "تجربة" },
  { value: "active", label: "نشط" },
  { value: "past_due", label: "متأخّر السداد" },
  { value: "suspended", label: "موقوف" },
  { value: "cancelled", label: "ملغى" },
];

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [extendMonths, setExtendMonths] = useState("1");
  const [creditsAmount, setCreditsAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${API_BASE}/api/settings/customers`);
    const data = (await res.json()) as { customers?: Customer[] };
    setCustomer(data.customers?.find(c => c.id === Number(id)) ?? null);
  }

  useEffect(() => { load(); }, [id]);

  async function patch(body: Record<string, unknown>, note: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMsg(`✗ ${data.error}`); return; }
      setMsg(`✓ ${note}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function grantCredits() {
    const amount = Number(creditsAmount);
    if (!amount) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/customers/${id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMsg(`✗ ${data.error}`); return; }
      setMsg(amount > 0 ? `✓ اتمنح ${amount} نقطة` : `✓ اتخصم ${-amount} نقطة`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!customer) return <main className="flex-1 flex items-center justify-center text-gray-400">جاري التحميل…</main>;

  const endDate = new Date(customer.subscriptionEndDate);
  const expired = endDate.getTime() < Date.now();

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
      <Link href="/settings" className="text-sm text-gray-500 underline">← كل العملاء</Link>
      <h1 className="text-2xl font-bold text-[#1D2D44] mt-2 mb-1">{customer.companyNameAr}</h1>
      <p className="text-xs text-gray-500 mb-6" dir="ltr">{customer.erpUrl} — {customer.erpUsername}</p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 flex flex-col gap-1 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">رصيد النقاط</span><b>{customer.creditsBalance}</b></div>
        <div className="flex justify-between"><span className="text-gray-500">الحد الشهري</span><b>{customer.monthlyCreditsAllowance}</b></div>
        <div className="flex justify-between">
          <span className="text-gray-500">تاريخ انتهاء الاشتراك</span>
          <b className={expired ? "text-red-600" : ""}>{endDate.toLocaleDateString("ar-SA")}{expired && " (منتهٍ)"}</b>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="font-bold text-[#1D2D44] mb-3 text-sm">حالة الاشتراك</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button key={s.value} disabled={busy || customer.subscriptionStatus === s.value}
              onClick={() => patch({ subscriptionStatus: s.value }, `الحالة بقت "${s.label}"`)}
              className={`text-xs rounded-full px-3 py-1.5 border ${customer.subscriptionStatus === s.value ? "bg-[#1D2D44] text-white border-[#1D2D44]" : "border-gray-300 text-gray-600 hover:border-[#1D2D44]"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="font-bold text-[#1D2D44] mb-3 text-sm">تمديد الاشتراك</h2>
        <div className="flex gap-2">
          <input type="number" min={1} value={extendMonths} onChange={e => setExtendMonths(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button disabled={busy} onClick={() => patch({ extendMonths: Number(extendMonths) }, `اتمدّد ${extendMonths} شهر`)}
            className="bg-[#1D2D44] text-white rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
            تمديد
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="font-bold text-[#1D2D44] mb-3 text-sm">شحن/خصم نقاط يدويًا</h2>
        <div className="flex gap-2">
          <input type="number" value={creditsAmount} onChange={e => setCreditsAmount(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="موجب للشحن، سالب للخصم" />
          <button disabled={busy} onClick={grantCredits}
            className="bg-[#5083BC] text-white rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
            تنفيذ
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-center mt-2">{msg}</p>}
    </main>
  );
}
