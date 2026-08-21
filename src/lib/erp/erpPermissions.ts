// ─── قراءة صلاحيات حساب الاتصال من نظام العميل ────────────────────────────────
// منقولة بتصرّف من almoaser-dev/server/erpPermissions.ts (قُرئت ٢٠ أغسطس
// ٢٠٢٦، مراجعة حرفية بطلب المالك). مُشذَّبة لأدوات ألاء الفعلية فقط —
// كلها قراءة، فـ RELEVANT_DOCTYPES/TOOL_DOC_ACTION أصغر بكثير من الأصل
// (لا Purchase Invoice/Payment Entry/Journal Entry — ألاء لا تملك أدوات
// لها أصلاً).
//
// **طبقة إرشادية لا حاجز أمني** — نفس تحذير الأصل حرفيًا: BLOCKED_DOCTYPES
// في executeTool.ts وصلاحيات ERPNext نفسها وقت التنفيذ هما الحاجز
// الحقيقي؛ هذه الطبقة تمنع فقط أن يعرض النموذج أداة سيرفضها نظام العميل.

export type DocPermRow = {
  parent: string;
  role: string;
  permlevel: number;
  read?: number;
};

export type ErpCapabilities = {
  unrestricted: boolean;
  can: (doctype: string, action: "read") => boolean;
};

export const ERP_SUPERUSER_ROLES = new Set(["System Manager", "Administrator"]);

/** الدوكتايبس التي تهم أدوات ألاء الثابتة (list_documents ديناميكية، تُفحص وقت التنفيذ لا هنا) */
export const RELEVANT_DOCTYPES = ["Sales Invoice", "Customer", "Item"];

export function computeCapabilities(roles: string[], rows: DocPermRow[]): ErpCapabilities {
  if (roles.some(r => ERP_SUPERUSER_ROLES.has(r))) {
    return { unrestricted: true, can: () => true };
  }
  const owned = new Set(roles);
  const docLevel = rows.filter(r => r.permlevel === 0 && owned.has(r.role));
  return {
    unrestricted: false,
    can: (doctype, action) => docLevel.some(r => r.parent === doctype && r[action] === 1),
  };
}

const cache = new Map<string, { caps: ErpCapabilities; expiry: number }>();
const TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

export function cacheKey(url: string, username: string) {
  return `${url.replace(/\/+$/, "")}::${username}`;
}

export function clearErpPermissionsCache() { cache.clear(); }

export function cachedErpCapabilities(url: string, username: string): ErpCapabilities | null {
  const hit = cache.get(cacheKey(url, username));
  return hit && hit.expiry > Date.now() ? hit.caps : null;
}

export async function fetchErpCapabilities(params: {
  url: string; username: string; authHeader: { header: "Cookie" | "Authorization"; value: string };
}): Promise<ErpCapabilities | null> {
  const key = cacheKey(params.url, params.username);
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return hit.caps;

  const base = params.url.replace(/\/+$/, "");
  const get = async (path: string) => {
    const res = await fetch(base + path, {
      headers: { [params.authHeader.header]: params.authHeader.value },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json() as Promise<{ data?: unknown }>;
  };

  try {
    const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
    const [userRes, permRes] = await Promise.all([
      get(`/api/resource/User/${encodeURIComponent(params.username)}?fields=${q(["roles"])}`),
      get(`/api/resource/DocPerm?filters=${q([["parent", "in", RELEVANT_DOCTYPES]])}`
        + `&fields=${q(["parent", "role", "permlevel", "read"])}`
        + `&limit_page_length=0&parent=DocType`),
    ]);
    const roles = (((userRes.data as { roles?: { role: string }[] } | undefined)?.roles) ?? []).map(r => r.role);
    const rows = (permRes.data as DocPermRow[] | undefined) ?? [];
    if (!roles.length) return null;
    const caps = computeCapabilities(roles, rows);
    cache.set(key, { caps, expiry: Date.now() + TTL_MS });
    return caps;
  } catch (e) {
    console.warn("[erpPermissions] تعذّرت قراءة الصلاحيات من نظام العميل:",
      e instanceof Error ? e.message : e);
    return null;
  }
}

/** أدوات ذات DocType ثابت فقط — list_documents ديناميكية، تُفحص وقت التنفيذ في executeTool */
export const TOOL_DOC_ACTION: Record<string, string> = {
  get_invoices: "Sales Invoice",
  get_invoice_detail: "Sales Invoice",
  get_customers: "Customer",
  get_items: "Item",
};

export function erpAllowsTool(caps: ErpCapabilities, toolName: string): boolean {
  if (caps.unrestricted) return true;
  const doctype = TOOL_DOC_ACTION[toolName];
  if (!doctype) return true; // list_documents وغيرها — تُفحص وقت التنفيذ لا هنا
  return caps.can(doctype, "read");
}
