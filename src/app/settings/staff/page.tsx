"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Staff = { id: number; email: string; name: string; role: "support" | "admin"; isActive: boolean };

export default function StaffPage() {
  const [list, setList] = useState<Staff[]>([]);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "support" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/staff");
    const data = (await res.json()) as { staff?: Staff[] };
    setList(data.staff ?? []);
  }

  useEffect(() => { load(); }, []);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? "تعذّر الإضافة"); return; }
      setForm({ email: "", name: "", password: "", role: "support" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
      <Link href="/settings" className="text-sm text-gray-500 underline">← إدارة العملاء</Link>
      <h1 className="text-2xl font-bold text-[#1D2D44] mt-2 mb-6">موظفو Horizon</h1>

      <div className="flex flex-col gap-2 mb-6">
        {list.map(s => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-bold text-[#1D2D44] text-sm">{s.name}</div>
              <div className="text-xs text-gray-500" dir="ltr">{s.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={s.role}
                disabled={busy}
                onChange={e => patch(s.id, { role: e.target.value })}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1"
              >
                <option value="support">دعم</option>
                <option value="admin">إدارة</option>
              </select>
              <button
                disabled={busy}
                onClick={() => patch(s.id, { isActive: !s.isActive })}
                className={`text-xs rounded-full px-2.5 py-1 font-semibold ${s.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-500"}`}
              >
                {s.isActive ? "مفعّل" : "معطّل"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={addStaff} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="font-bold text-[#1D2D44] text-sm">موظف جديد</h2>
        <input required placeholder="الاسم" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input required type="email" placeholder="البريد الإلكتروني" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" dir="ltr" />
        <input required type="password" placeholder="كلمة المرور (٨ أحرف على الأقل)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" dir="ltr" />
        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="support">دعم</option>
          <option value="admin">إدارة</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} type="submit" className="bg-[#1D2D44] text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60">
          إضافة
        </button>
      </form>
    </main>
  );
}
