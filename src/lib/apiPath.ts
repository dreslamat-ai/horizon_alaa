// basePath التطبيق ثابت في next.config.ts، لكن fetch() من مكوّنات العميل
// لا يحسبه تلقائيًا كما يفعل next/link — لازم يُضاف يدويًا لكل نداء API داخلي.
export const API_BASE = "/alaa";
