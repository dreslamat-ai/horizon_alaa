"use client";

import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/apiPath";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-gray-500 underline"
    >
      تسجيل خروج
    </button>
  );
}
