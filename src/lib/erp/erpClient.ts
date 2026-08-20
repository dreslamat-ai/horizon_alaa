// عميل HTTP لـERPNext + سياق AsyncLocalStorage — منقولة بتصرّف من
// almoaser-dev/server/agent/erpClient.ts (قُرئت ١٩-٢٠ أغسطس ٢٠٢٦). الفرق
// الجوهري: هناك `runWithErpConfig(userId, fn)` يجيب اتصال كل مستخدم من
// جدول erpnextConnections، وهنا `runWithFixedConfig(fn)` يستخدم الاتصال
// الثابت الوحيد (fixedErpConfig) — يتغيّر في مرحلة ٢ لاتصال لكل عميل.
import { AsyncLocalStorage } from "async_hooks";
import { fixedErpConfig, getErpSession, invalidateErpSession, type ErpConfig } from "./erpConnection";

const ERROR_KEEP = 4000;

export const erpContext = new AsyncLocalStorage<ErpConfig>();

export async function runWithFixedConfig<T>(fn: () => Promise<T>): Promise<T> {
  const config = fixedErpConfig();
  return erpContext.run(config, fn);
}

export function currentErpConfig(): ErpConfig {
  const cfg = erpContext.getStore();
  if (cfg) return cfg;
  return fixedErpConfig();
}

async function getSession(): Promise<string> {
  return getErpSession(currentErpConfig());
}

function erpBaseUrl(): string {
  return currentErpConfig().url;
}

export async function erpGET(path: string): Promise<unknown> {
  const url = erpBaseUrl();
  const sid = await getSession();
  const res = await fetch(`${url}${path}`, { headers: { Cookie: `sid=${sid}` } });
  if (res.status === 401 || res.status === 403) {
    invalidateErpSession();
    const sid2 = await getSession();
    const res2 = await fetch(`${url}${path}`, { headers: { Cookie: `sid=${sid2}` } });
    if (!res2.ok) throw new Error(`ERPNext GET error ${res2.status}`);
    return res2.json();
  }
  if (!res.ok) throw new Error(`ERPNext GET error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function erpPOST(path: string, body: Record<string, unknown>): Promise<unknown> {
  const url = erpBaseUrl();
  const sid = await getSession();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ERPNext POST error ${res.status}: ${errText.slice(0, ERROR_KEEP)}`);
  }
  return res.json();
}
