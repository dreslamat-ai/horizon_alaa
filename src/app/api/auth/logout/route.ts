import { NextResponse } from "next/server";
import { SESSION_COOKIE, CUSTOMER_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(CUSTOMER_COOKIE);
  return res;
}
