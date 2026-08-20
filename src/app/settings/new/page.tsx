"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Plan = { id: number; nameAr: string; monthlyCreditsAllowance: number };

export default function NewCustomerPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({
    companyNameAr: "", companyNameEn: "", erpUrl: "https://", erpUsername: "", erpPassword: "",
    planId: "", subscriptionMonths: "1",
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/plans").then(r => r.json()).then((d: { plans?: Plan[] }) => {
      setPlans(d.plans ?? []);
      if (d.plans?.length) setForm(f => ({ ...f, planId: String(d.plans![0].id) }));
    });
  }, []);

  function update(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setTestResult(null); // أي تعديل في بيانات الاتصال يُبطل نتيجة الاختبار السابقة
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/erp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.erpUrl, username: form.erpUsername, password: form.erpPassword }),
      });
      const data = (await res.json()) as { ok: boolean; loggedInAs?: string; error?: string };
      setTestResult({
        ok: data.ok,
        message: data.ok ? `✓ الاتصال ناجح — مسجَّل باسم ${data.loggedInAs}` : `✗ ${data.error}`,
      });
    } catch {
      setTestResult({ ok: false, message: "✗ تعذّر الوصول للخادم" });
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          planId: Number(form.planId),
          subscriptionMonths: Number(form.subscriptionMonths),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر الحفظ");
        return;
      }
      router.push("/settings");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1D2D44] mb-6">عميل ألاء جديد</h1>

      <form onSubmit={submit} className="flex flex-col gap-4 bg-white border border-gray-200 rounded-xl p-6">
        <div>
          <label className="block text-sm text-gray-700 mb-1">اسم الشركة (عربي)</label>
          <input required value={form.companyNameAr} onChange={e => update("companyNameAr", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">اسم الشركة (إنجليزي، اختياري)</label>
          <input value={form.companyNameEn} onChange={e => update("companyNameEn", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" dir="ltr" />
        </div>

        <hr className="my-1" />
        <p className="text-xs text-gray-500 -mt-2">
          اتصال Horizon ERPNext الخاص بالعميل — يُفضَّل حساب موظف قراءة محدود الصلاحيات، لا مدير نظام.
        </p>

        <div>
          <label className="block text-sm text-gray-700 mb-1">رابط ERPNext</label>
          <input required value={form.erpUrl} onChange={e => update("erpUrl", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" dir="ltr" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">اسم المستخدم</label>
          <input required value={form.erpUsername} onChange={e => update("erpUsername", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" dir="ltr" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">كلمة المرور</label>
          <input required type="password" value={form.erpPassword} onChange={e => update("erpPassword", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" dir="ltr" />
        </div>

        <button type="button" onClick={testConnection} disabled={testing || !form.erpUrl || !form.erpUsername || !form.erpPassword}
          className="border border-[#1D2D44] text-[#1D2D44] rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
          {testing ? "جاري الاختبار…" : "اختبار الاتصال"}
        </button>
        {testResult && (
          <p className={`text-sm ${testResult.ok ? "text-green-700" : "text-red-600"}`}>{testResult.message}</p>
        )}

        <hr className="my-1" />

        <div>
          <label className="block text-sm text-gray-700 mb-1">الباقة</label>
          <select value={form.planId} onChange={e => update("planId", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2">
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.nameAr} — {p.monthlyCreditsAllowance} نقطة/شهر</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">مدة الاشتراك الأولى (أشهر)</label>
          <input type="number" min={1} value={form.subscriptionMonths} onChange={e => update("subscriptionMonths", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={saving}
          className="bg-[#1D2D44] text-white rounded-lg py-2.5 font-semibold disabled:opacity-60">
          {saving ? "جاري الحفظ…" : "حفظ العميل"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          الحفظ يتحقق من الاتصال فعليًا حتى لو لم تضغط زر الاختبار أعلاه.
        </p>
      </form>
    </main>
  );
}
