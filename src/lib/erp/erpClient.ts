// عميل HTTP لـERPNext + سياق AsyncLocalStorage — منقولة بتصرّف من
// almoaser-dev/server/agent/erpClient.ts (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦).
// مرحلة ٢: runWithCustomerConfig(customerId, fn) يبني الاتصال من صف
// alaa_customers — يحلّ محلّ runWithFixedConfig المرحلة ١.
//
// ٢١ أغسطس: الهيدر (Cookie جلسة أو Authorization API Key) يُبنى ديناميكيًا
// عبر getErpAuthHeader — لا افتراض إنه دايمًا كوكيز sid كما كان.
import { AsyncLocalStorage } from "async_hooks";
import { getErpConfigForCustomer, getErpAuthHeader, invalidateErpSession, type ErpConfig } from "./erpConnection";

const ERROR_KEEP = 4000;

export const erpContext = new AsyncLocalStorage<ErpConfig>();

export async function runWithCustomerConfig<T>(customerId: number, fn: () => Promise<T>): Promise<T> {
  const config = await getErpConfigForCustomer(customerId);
  return erpContext.run(config, fn);
}

export function currentErpConfig(): ErpConfig {
  const cfg = erpContext.getStore();
  if (!cfg) throw new Error("لا يوجد اتصال ERPNext نشط — استدعاء executeTool لازم يكون داخل runWithCustomerConfig");
  return cfg;
}

async function authHeaders(): Promise<Record<string, string>> {
  const cfg = currentErpConfig();
  const auth = await getErpAuthHeader(cfg);
  return { [auth.header]: auth.value };
}

function erpBaseUrl(): string {
  return currentErpConfig().url;
}

export async function erpGET(path: string): Promise<unknown> {
  const url = erpBaseUrl();
  const headers = await authHeaders();
  const res = await fetch(`${url}${path}`, { headers });
  if (res.status === 401 || res.status === 403) {
    const cfg = currentErpConfig();
    if (cfg.authType === "password") {
      // api_key بلا جلسة تنتهي أصلاً — إعادة المحاولة هنا لن تغيّر شيئًا،
      // فالفشل حقيقي (صلاحيات) لا انتهاء جلسة.
      invalidateErpSession(cfg);
      const headers2 = await authHeaders();
      const res2 = await fetch(`${url}${path}`, { headers: headers2 });
      if (!res2.ok) throw new Error(`ERPNext GET error ${res2.status}`);
      return res2.json();
    }
  }
  if (!res.ok) throw new Error(`ERPNext GET error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function erpPOST(path: string, body: Record<string, unknown>): Promise<unknown> {
  const url = erpBaseUrl();
  const headers = await authHeaders();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ERPNext POST error ${res.status}: ${errText.slice(0, ERROR_KEEP)}`);
  }
  return res.json();
}

export async function erpPUT(path: string, body: Record<string, unknown>): Promise<unknown> {
  const url = erpBaseUrl();
  const headers = await authHeaders();
  const res = await fetch(`${url}${path}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ERPNext PUT error ${res.status}: ${errText.slice(0, ERROR_KEEP)}`);
  }
  return res.json();
}

export function erpApiBase(): string {
  return currentErpConfig().url.replace(/\/+$/, "");
}
