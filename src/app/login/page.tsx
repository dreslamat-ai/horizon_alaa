"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/apiPath";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر تسجيل الدخول");
        return;
      }
      router.push(params.get("next") || "/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">البريد الإلكتروني</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1D2D44]"
          autoComplete="username"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">كلمة المرور</label>
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1D2D44]"
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-[#1D2D44] text-white rounded-lg py-2.5 font-semibold disabled:opacity-60"
      >
        {loading ? "جاري الدخول…" : "تسجيل دخول"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#DFE0DB] px-4" dir="rtl">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-full overflow-hidden">
            <img src={`${API_BASE}/alaa-avatar.png`} alt="ألاء" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-bold text-[#1D2D44]">تسجيل الدخول إلى ألاء</h1>
          <p className="text-sm text-gray-500">لموظفي Horizon فقط</p>
        </div>
        <Suspense fallback={<div className="text-center text-sm text-gray-400">جاري التحميل…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
