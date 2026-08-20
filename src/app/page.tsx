import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import AlaaWidget from "@/components/AlaaWidget";
import LogoutButton from "@/components/LogoutButton";

export default async function HomePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-[#1D2D44] flex items-center justify-center text-white text-3xl font-bold">
        أ
      </div>
      <h1 className="text-2xl font-bold text-[#1D2D44]">أهلاً {staff.name}</h1>
      <p className="text-gray-600 max-w-md">
        اضغط الزر العائم في الأسفل، اختر العميل، واسأل عن بيانات نظامه في
        Horizon ERPNext.
      </p>
      <div className="flex gap-4 items-center">
        <Link href="/settings" className="text-sm text-[#1D2D44] underline font-semibold">إدارة العملاء</Link>
        <LogoutButton />
      </div>
      <AlaaWidget />
    </main>
  );
}
