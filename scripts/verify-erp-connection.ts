// تحقّق فعلي أن مفتاح API لأول عميل يوصل ERPNext ويُسجَّل بحساب حقيقي.
// دليل مباشر (لا مجرد صفّ مضاف): يفكّ التشفير ويستدعي get_logged_user،
// ويطبع loggedInAs فقط — لا الـsecret.
import { db, schema } from "../src/lib/db";
import { decryptSecret } from "../src/lib/crypto";
import { testErpConnection, type ErpAuthType } from "../src/lib/erp/erpConnection";

async function main() {
  const [c] = await db.select().from(schema.alaaCustomers).limit(1);
  if (!c) throw new Error("لا يوجد عميل في alaa_customers");
  const secret = decryptSecret(c.erpPasswordEnc);
  const r = await testErpConnection(c.erpUrl, c.erpUsername, secret, c.authType as ErpAuthType);
  console.log("RESULT", JSON.stringify({ url: c.erpUrl, authType: c.authType, ok: r.ok, loggedInAs: r.loggedInAs, error: r.error }));
}

main().then(() => process.exit(0)).catch((e) => { console.error("فشل:", e.message); process.exit(1); });
