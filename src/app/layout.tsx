import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  // "swap" (الافتراضي) يعرض خط النظام فورًا ثم يبدّله بعد تحميل Cairo —
  // داخل iframe محتضَن في desk، هذا التبديل قد يظهر كـ"مش Cairo" لمن
  // يفتح ويقرأ بسرعة. "block" ينتظر تحميل الخط قصيرًا قبل عرض أي نص.
  display: "block",
});

export const metadata: Metadata = {
  title: "ألاء — Horizon",
  description: "مساعد Horizon الذكي لموظفي الدعم — قراءة بيانات ERPNext",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-cairo)] bg-[#DFE0DB]">{children}</body>
    </html>
  );
}
