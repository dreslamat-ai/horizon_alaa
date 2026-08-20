import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

const STATUS_LABEL: Record<string, string> = {
  trial: "تجربة",
  active: "نشط",
  past_due: "متأخّر السداد",
  suspended: "موقوف",
  cancelled: "ملغى",
};

const STATUS_COLOR: Record<string, string> = {
  trial: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-orange-100 text-orange-800",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-600",
};

export default async function SettingsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const customers = await db.select().from(schema.alaaCustomers);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1D2D44]">إدارة عملاء ألاء</h1>
          <p className="text-sm text-gray-500">تفعيل الاشتراكات وشحن النقاط</p>
        </div>
        <div className="flex gap-3 items-center">
          <Link href="/" className="text-sm text-gray-500 underline">رجوع للمحادثة</Link>
          <Link href="/settings/staff" className="text-sm text-[#1D2D44] underline">موظفو Horizon</Link>
          <Link href="/settings/new" className="bg-[#1D2D44] text-white rounded-lg px-4 py-2 text-sm font-semibold">
            + عميل جديد
          </Link>
        </div>
      </div>

      {customers.length === 0 && (
        <div className="text-center text-gray-400 py-12">لا يوجد عملاء بعد.</div>
      )}

      <div className="flex flex-col gap-3">
        {customers.map(c => (
          <Link
            key={c.id}
            href={`/settings/${c.id}`}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:border-[#1D2D44] transition"
          >
            <div>
              <div className="font-bold text-[#1D2D44]">{c.companyNameAr}</div>
              <div className="text-xs text-gray-500">{c.erpUrl}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">رصيد: <b>{c.creditsBalance}</b></span>
              <span className={`text-xs rounded-full px-2.5 py-1 font-semibold ${STATUS_COLOR[c.subscriptionStatus]}`}>
                {STATUS_LABEL[c.subscriptionStatus]}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
