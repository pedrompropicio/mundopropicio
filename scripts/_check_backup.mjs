import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ukpuhoynrqobqtzdbysp.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);
const { data, error } = await sb.storage.from("database-backups").download("backup-2026-04-29T18-01-40.json");
if (error) { console.error("err", error); process.exit(1); }
const text = await data.text();
const json = JSON.parse(text);
const cats = json.tables?.account_categories || json.account_categories || [];
console.log("Total categorias no backup:", cats.length);
const l4 = cats.filter(c => (c.code.match(/\./g) || []).length === 3);
console.log("L4 no backup 29-Abr:", l4.length);
l4.sort((a,b)=>a.code.localeCompare(b.code)).forEach(c => console.log(" ", c.code, c.name, "co:", c.company_id?.slice(0,8)));
