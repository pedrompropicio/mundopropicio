// fx-rates-sync — enche public.fx_rates_daily com o câmbio de referência do BCE
// (D-ERP92). Fonte única do ERP: Frankfurter (dados do BCE), o mesmo helper das
// faturas (_shared/fx-rate.ts).
//
// Uma linha por DIA DE CALENDÁRIO e moeda: nos dias sem fixing (fins de semana e
// feriados) grava-se a taxa do último dia de fixing anterior, e `date_used` diz
// qual foi. É isso que permite que o join por data nas RPCs seja uma igualdade.
// EUR não se grava (taxa 1 implícita em public.fx_convert).
//
// Só service_role (cron). Falha do upstream → sync_run 'error' + 502; nunca se
// inventam linhas.

import { adminClient, authorize, corsHeaders, json } from "../_shared/artist-meta.ts";
import { FX_CURRENCIES, getEcbSeries, type FxCurrency } from "../_shared/fx-rate.ts";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "fx-rates-sync";
const DEFAULT_CURRENCIES: FxCurrency[] = ["BRL", "USD", "GBP"];
const DAY = 86_400_000;

const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Todos os dias de calendário de `from` a `to`, inclusive. */
function calendarDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  // Lista de papéis vazia: só a chave de serviço passa.
  const caller = await authorize(req, admin, []);
  if (!caller.allowed || !caller.isServiceRole) {
    return json({ error: "apenas service_role", reason: caller.reason ?? null }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const until = body?.until == null || body.until === "" ? today() : String(body.until);
  const since = body?.since == null || body.since === "" ? addDays(until, -6) : String(body.since);

  if (!isDay(since) || !isDay(until)) {
    return json({ error: "since/until inválidos — use AAAA-MM-DD." }, 400);
  }
  if (since > until) return json({ error: "since depois de until." }, 400);
  if (until > today()) return json({ error: "until no futuro — não existe câmbio de referência." }, 400);

  let currencies: FxCurrency[] = DEFAULT_CURRENCIES;
  if (Array.isArray(body?.currencies) && body.currencies.length > 0) {
    const asked = body.currencies.map((c: unknown) => String(c).toUpperCase());
    const bad = asked.filter((c: string) => !FX_CURRENCIES.includes(c as FxCurrency));
    if (bad.length) return json({ error: `Moeda não suportada: ${bad.join(", ")}` }, 400);
    // EUR não se grava (taxa 1 implícita em fx_convert).
    currencies = asked.filter((c: string) => c !== "EUR") as FxCurrency[];
  }

  const startedMs = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: false,
  });

  const days = calendarDays(since, until);
  const perCurrency: Record<string, { rows: number; fixings: number }> = {};
  const errors: string[] = [];
  let apiCalls = 0;
  let rowsWritten = 0;

  for (const currency of currencies) {
    try {
      // Recua 10 dias na consulta para haver sempre um fixing anterior a `since`
      // (pontes e feriados longos), sem alargar os dias gravados.
      const series = await getEcbSeries(currency, addDays(since, -10), until);
      apiCalls += 1;
      const fixings = Object.keys(series).sort();

      const rows: Array<Record<string, unknown>> = [];
      for (const day of days) {
        // Último fixing <= dia de calendário.
        let used: string | null = null;
        for (const f of fixings) {
          if (f <= day) used = f;
          else break;
        }
        if (!used) continue; // sem fixing anterior: não se inventa taxa
        rows.push({
          rate_date: day,
          currency,
          rate_to_eur: series[used],
          source: "frankfurter",
          date_used: used,
          fetched_at: new Date().toISOString(),
        });
      }

      if (rows.length) {
        const { error } = await admin
          .from("fx_rates_daily")
          .upsert(rows, { onConflict: "rate_date,currency" });
        if (error) throw error;
        rowsWritten += rows.length;
      }
      perCurrency[currency] = { rows: rows.length, fixings: fixings.length };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      errors.push(`${currency}: ${msg}`);
      perCurrency[currency] = { rows: 0, fixings: 0 };
    }
  }

  const details = { since, until, currencies, days: days.length, per_currency: perCurrency };
  const status = resolveStatus(rowsWritten, errors.length);
  await finishSyncRun(admin, runId, startedMs, {
    status,
    api_calls: apiCalls,
    rows_written: rowsWritten,
    details,
    error_text: errors.length ? errors.join(" | ") : null,
  });

  if (rowsWritten === 0 && errors.length) {
    return json({ error: "BCE indisponível", errors, ...details }, 502);
  }
  return json({ status, rows_written: rowsWritten, api_calls: apiCalls, errors, ...details });
});
