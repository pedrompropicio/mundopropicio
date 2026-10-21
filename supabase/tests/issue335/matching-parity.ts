// LOCAL ONLY: emit SQL assertions from the actual canonical JS helper.
import { findMatchingTransactionsForForecast, normalizeMatchText, scoreDescriptionMatch } from '../../../src/lib/bp-tx-matching';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const quote = (v: unknown) => v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`;
const company = id(1);
let count = 0;
console.log('BEGIN;');
for (const mode of ['empty', 'master', 'conflicting-anchor', 'tie', 'shared', 'large', 'null-event', 'accents']) {
  const ev = id(8000 + count * 10), master = id(8001 + count * 10), cat = id(8002 + count * 10);
  const f = { id: id(9000 + count * 10), event_id: ev, category_id: cat, type: 'income', description: mode === 'accents' ? 'DIÁRIAS/STAFF' : 'staff food', transaction_id: null as string | null };
  const other = { ...f, id: id(9001 + count * 10), description: mode === 'tie' ? f.description : 'rooms rent' };
  const txs = Array.from({length: mode === 'empty' ? 0 : mode === 'large' ? 1002 : 3}, (_, i) => ({ id: id(100000 + count * 2000 + i), event_id: mode === 'master' ? master : mode === 'null-event' ? null : ev, category_id: cat, type: 'income', description: mode === 'accents' ? 'diarias staff' : i % 2 === 0 ? 'staff food' : 'rooms rent', forecast_id: null as string | null }));
  if (mode === 'conflicting-anchor') { f.transaction_id = txs[0]?.id ?? null; other.transaction_id = f.transaction_id; const t = txs[0]; if (t) t.forecast_id = other.id; }
  if (mode === 'shared') { const t = txs[0]; if (t) t.forecast_id = f.id; }
  const forecasts = mode === 'tie' || mode === 'conflicting-anchor' || mode === 'shared' ? [f, other] : [f];
  // Live trigger sync_forecast_anchor_to_tx forbids creating conflicting anchors today; legacy rows can predate it,
  // so that fixture alone is written with user triggers off (replica) to reproduce the historical state exactly.
  if (mode === 'conflicting-anchor') console.log(`SET session_replication_role=replica;`);
  console.log(`INSERT INTO events(id,company_id,name,parent_event_id) VALUES(${quote(master)},${quote(company)},'parity master',NULL),(${quote(ev)},${quote(company)},'parity',${quote(master)});`);
  for (const x of forecasts) console.log(`INSERT INTO event_forecasts(id,company_id,event_id,category_id,type,description,amount,iva_rate,approved_at) VALUES(${quote(x.id)},${quote(company)},${quote(ev)},${quote(cat)},'income',${quote(x.description)},1,0,now());`);
  for (const t of txs) console.log(`INSERT INTO transactions(id,company_id,event_id,category_id,type,description,amount,iva_rate,date,forecast_id) VALUES(${quote(t.id)},${quote(company)},${quote(t.event_id)},${quote(cat)},'income',${quote(t.description)},1,0,'2026-10-13',${quote(t.forecast_id)});`);
  for (const x of forecasts) if (x.transaction_id) console.log(`UPDATE event_forecasts SET transaction_id=${quote(x.transaction_id)} WHERE id=${quote(x.id)};`);
  if (mode === 'conflicting-anchor') console.log(`SET session_replication_role=origin;`);
  // Installed anchor synchronization may change FK: reload test projection in JS exactly as server triggers do.
  if (mode === 'conflicting-anchor') { const t = txs[0]; if (t) t.forecast_id = other.id; }
  for (const x of forecasts) {
    const expected = findMatchingTransactionsForForecast(x,txs,forecasts).map((t: {id: string})=>t.id).sort();
    console.log(`DO $$ BEGIN IF COALESCE((SELECT array_agg(x ORDER BY x) FROM issue335_matching_transactions(${quote(x.id)}) x),'{}'::uuid[]) IS DISTINCT FROM ARRAY[${expected.map(quote).join(',')}]::uuid[] THEN RAISE EXCEPTION 'BP parity ${mode} forecast ${x.id}: SQL % JS ${expected.join(" ")}',(SELECT array_agg(x ORDER BY x) FROM issue335_matching_transactions(${quote(x.id)}) x); END IF; END $$;`);
  }
  count++;
}
for (const text of ['DIÁRIAS/STAFF','A\u0301gua','', '€ 123 / rent', 'İstanbul', 'ÀÉÍÓÚ Ç']) {
 console.log(`DO $$ BEGIN IF issue335_normalize(${quote(text)}) IS DISTINCT FROM ${quote(normalizeMatchText(text))} THEN RAISE EXCEPTION 'normalize parity'; END IF; END $$;`);
}
for (const [f,t] of [['staff food','food staff extras'],['',''],['a','a'],['DIÁRIAS','diarias staff']]) console.log(`DO $$ BEGIN IF abs(issue335_score(${quote(f)},${quote(t)})-${scoreDescriptionMatch(f,t)})>1e-9 THEN RAISE EXCEPTION 'score parity'; END IF; END $$;`);
console.log(`ROLLBACK; DO $$ BEGIN RAISE NOTICE 'PASS BP JS/SQL parity: ${count} cases, 1002 transactions, anchors, ties, master exclusion, accents and scores'; END $$;`);
