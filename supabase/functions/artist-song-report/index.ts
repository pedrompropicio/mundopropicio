// artist-song-report — relatório de lançamento de uma música, gerado por LLM.
//
// POST { song_id: uuid, days?: number (30), dry_run?: boolean (false) }
//
// Regra absoluta (D-ERP54): o modelo só pode usar números do snapshot que lhe
// enviamos. Nada é estimado. Quando um dado não existe, o snapshot diz-o em
// `lacunas` e o modelo tem de responder "sem dados".
//
// dry_run = true  → devolve só o snapshot, sem chamar o LLM e sem gravar.
// dry_run = false → chama o LLM, grava uma linha nova em artist_song_reports
//                   (histórico: regenerar nunca substitui) e devolve o relatório.
//
// Limite: no máximo 1 geração automática (trigger 'cron') por música por dia de calendário UTC.
//
// Regeneração por ALTERAÇÃO DE DADOS (D-ERP54 adenda 19/09/2026):
// body { trigger_source: 'data_change', stale_at } — só aceite de service_role.
// Não tem a guarda do cron; tem teto próprio de 6 TENTATIVAS por música por dia UTC
// (conta ok e erro). No fim de uma geração 'ok' limpa artist_songs.report_stale_at
// apenas se ninguém mexeu na marca entretanto.


import {
  adminClient,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
} from "../_shared/soundcharts.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";

const FUNCTION_NAME = "artist-song-report";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const MODEL = "google/gemini-2.5-flash";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

import {
  buildSnapshot,
} from "../_shared/artist-song-snapshot.ts";


// ---------------------------------------------------------------- LLM
const SYSTEM_PROMPT =
  `Você é analista de marketing musical especializado em artistas de forró e piseiro no Nordeste do Brasil.
Seu leitor é empresarial (produtoras e casas de evento) e olha número: fale com dado na mão, sem enfeite.

REGRAS ABSOLUTAS:
1. Você só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, inferir números ausentes ou trazer benchmarks de fora. O único arredondamento permitido é o da regra 13.
2. Toda recomendação precisa citar em "porque" o número exato do snapshot que a justifica.
3. Se o dado não existe no snapshot, escreva "sem dados" e liste isso em lacunas_de_dados. Nunca preencha com suposição.
4. Recomendações práticas e mensuráveis: ação concreta, plataforma, esforço, métrica de sucesso e prazo.
5. Português do Brasil.

REGRAS DE AVALIAÇÃO RELATIVA (obrigatórias):
6. É PROIBIDO qualificar qualquer métrica em absoluto ("fraco", "forte", "baixo", "viral", "explodiu"). Toda leitura é RELATIVA às músicas de "benchmark_alinhado" — comparáveis à MESMA idade (campo idade_comparada_dias) — e ao ritmo por dia. Cite sempre o número de referência e a posição no ranking, no formato "4.º de 11 em streams ao dia 11".
7. Quando um comparável tem UGC muito acima do que o número oficial sugere, explique o mecanismo APENAS se ele estiver escrito em "nota_da_musica" desse comparável. Nunca invente o mecanismo.
8. As sugestões accionáveis derivam do que os comparáveis com melhor resultado fizeram, com os números deles à mesma idade.
9. Se não houver comparável com dados para uma métrica (posição ou total ausentes/1), escreva "sem referência" e NÃO avalie essa métrica.
10. Preencha "benchmark" e "avaliacao_relativa" só com números do snapshot.
11. "spotify_for_artists" (S4A) é a FONTE OFICIAL de streams da música e das playlists. A Soundcharts é contagem pública desfasada. Quando as duas existirem, avalie pelo S4A e mencione explicitamente a diferença entre as duas. Se "spotify_for_artists" for null, escreva "sem dados do Spotify for Artists".
12. Só as músicas do elenco têm S4A; as de referência no benchmark não têm. É PROIBIDO comparar streams do S4A com streams da Soundcharts de comparáveis.

REGRAS DE FORMATO DE NÚMEROS (valem para todos os campos de texto, incluindo numeros_citados):
13. Contagens (streams, publicações, views, seguidores, ouvintes, playlists, saves) e ritmos por dia são SEMPRE inteiros. Se o snapshot trouxer casas decimais, arredonde ao inteiro mais próximo (231.25 → 231; 17429.57 → 17.430). É PROIBIDO escrever casas decimais em contagens.
14. Formato pt-BR: ponto só como separador de milhar (66.122; 1.329.029); vírgula só como separador decimal, permitida apenas em percentuais, com no máximo 1 casa (12,5%). Nunca use ponto como decimal. Nunca abrevie ("66 mil", "1,3 mi"): escreva o número inteiro.
15. Nos campos numéricos da ferramenta (valor, posicao, total, idade_dias, prazo_dias) devolva número puro, inteiro, sem separadores.

REGRAS DE FRESCURA:
16. Todo número de registro manual (tiktok_ugc_publicacoes, métricas s4a_*, streams por playlist) é citado com a data do dado: "7.320 publicações (registro de 18/09)". Use tiktok_ugc_data, spotify_for_artists.snapshot e metricas_da_musica[].data.
17. Ritmo por dia: use só o campo de ritmo que vem no snapshot. É PROIBIDO recalcular dividindo por outra idade e é PROIBIDO chamar um total acumulado de "por dia".
18. Se frescura.ugc_dias_de_atraso for maior que 2, inclua em sinais_de_alerta "UGC TikTok desatualizado: último registro em DD/MM" e não descreva tendência de UGC. O mesmo para frescura.s4a_dias_de_atraso maior que 8. Se frescura.benchmark_ugc_dias_de_atraso for maior que 2, diga na comparação de UGC que os comparáveis têm registro de DD/MM e não conclua ultrapassagens por margens pequenas.`;


const REPORT_TOOL = {
  type: "function",
  function: {
    name: "gerar_relatorio",
    description: "Devolve o relatório de lançamento estruturado.",
    parameters: {
      type: "object",
      properties: {
        resumo_executivo: { type: "string", description: "3 a 5 frases." },
        diagnostico_por_plataforma: {
          type: "array",
          items: {
            type: "object",
            properties: {
              plataforma: { type: "string" },
              leitura: { type: "string" },
              numeros_citados: { type: "array", items: { type: "string" } },
            },
            required: ["plataforma", "leitura", "numeros_citados"],
          },
        },
        o_que_esta_puxando: { type: "array", items: { type: "string" } },
        sinais_de_alerta: { type: "array", items: { type: "string" } },
        recomendacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prioridade: { type: "integer", description: "1 (maior) a 5." },
              acao: { type: "string" },
              porque: { type: "string", description: "Cita o número do snapshot." },
              plataforma: { type: "string" },
              esforco: { type: "string", enum: ["baixo", "médio", "alto"] },
              metrica_de_sucesso: { type: "string" },
              prazo_dias: { type: "integer" },
            },
            required: [
              "prioridade",
              "acao",
              "porque",
              "plataforma",
              "esforco",
              "metrica_de_sucesso",
              "prazo_dias",
            ],
          },
        },
        plano_7_dias: {
          type: "array",
          items: {
            type: "object",
            properties: { dia: { type: "integer" }, acao: { type: "string" } },
            required: ["dia", "acao"],
          },
        },
        benchmark: {
          type: "array",
          description: "Linhas do benchmark alinhado por idade usadas na análise.",
          items: {
            type: "object",
            properties: {
              artista: { type: "string" },
              musica: { type: "string" },
              idade_dias: { type: "integer" },
              metrica: { type: "string" },
              valor: { type: "number" },
              posicao: { type: "integer" },
            },
            required: ["artista", "musica", "idade_dias", "metrica", "valor", "posicao"],
          },
        },
        avaliacao_relativa: {
          type: "array",
          description: "Uma entrada por métrica: spotify, tiktok_ugc, videos_artista, playlists.",
          items: {
            type: "object",
            properties: {
              metrica: {
                type: "string",
                enum: ["spotify", "tiktok_ugc", "videos_artista", "playlists"],
              },
              posicao: { type: "integer", description: "0 quando não há referência." },
              total: { type: "integer", description: "0 quando não há referência." },
              frase: {
                type: "string",
                description: "Uma frase curta, sempre relativa; 'sem referência' se não houver dados.",
              },
            },
            required: ["metrica", "posicao", "total", "frase"],
          },
        },
        lacunas_de_dados: { type: "array", items: { type: "string" } },
      },
      required: [
        "resumo_executivo",
        "diagnostico_por_plataforma",
        "o_que_esta_puxando",
        "sinais_de_alerta",
        "recomendacoes",
        "plano_7_dias",
        "benchmark",
        "avaliacao_relativa",
        "lacunas_de_dados",
      ],

      additionalProperties: false,
    },
  },
};

async function callLlm(snapshot: unknown) {
  const body = {
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Snapshot da base (única fonte de números permitida):\n\n${JSON.stringify(snapshot)}`,
      },
    ],
    tools: [REPORT_TOOL],
    tool_choice: { type: "function", function: { name: "gerar_relatorio" } },
  };
  const call = () =>
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let resp = await call();
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    resp = await call();
  }
  if (resp.status === 429) {
    return { fail: { status: 429, error: "rate_limited", message: "Lovable AI com limite de pedidos; tenta outra vez daqui a pouco." } };
  }
  if (resp.status === 402) {
    return { fail: { status: 402, error: "credits_exhausted", message: "Sem créditos no Lovable AI." } };
  }
  if (!resp.ok) {
    const t = await resp.text();
    return { fail: { status: 502, error: "ai_gateway_error", message: `HTTP ${resp.status} — ${t.slice(0, 500)}` } };
  }
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    return { fail: { status: 502, error: "ai_invalid_response", message: "Modelo não devolveu a ferramenta." } };
  }
  let report: unknown;
  try {
    report = JSON.parse(args);
  } catch {
    return { fail: { status: 502, error: "ai_invalid_json", message: String(args).slice(0, 500) } };
  }
  return {
    report,
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
  };
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const startedMs = Date.now();
  let triggerSource = deduceTriggerSource(req);
  let runId: string | null = null;

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);
    const generatedBy = caller.isServiceRole ? "service_role" : (caller.userId ?? "desconhecido");

    let p: {
      song_id?: string;
      days?: number;
      dry_run?: boolean;
      trigger_source?: string;
      stale_at?: string;
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }
    const songId = typeof p.song_id === "string" ? p.song_id : "";
    if (!songId) return json({ error: "song_id obrigatório" }, 400);
    const days = Number.isFinite(p.days) ? Math.max(7, Math.min(180, Number(p.days))) : 30;
    const dryRun = p.dry_run === true;

    // 'data_change' só vale vindo de service_role; de utilizador é ignorado.
    const isDataChange = p.trigger_source === "data_change" && caller.isServiceRole;
    if (isDataChange) triggerSource = "data_change";
    const staleAt = isDataChange && typeof p.stale_at === "string" ? p.stale_at : null;

    const built = await buildSnapshot(admin, songId, days);
    if (built.notFound) return json({ error: "música não encontrada" }, 404);
    const { song, snapshot, periodStart, periodEnd } = built;

    if (!caller.isServiceRole) {
      const companyIds = await callerCompanyIds(admin, caller.userId!);
      if (companyIds !== "all" && !companyIds.includes(song.company_id)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, song_id: songId, snapshot });
    }

    const utcMidnight = () => {
      const t = new Date();
      return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())).toISOString();
    };

    // Teto próprio do 'data_change': 6 TENTATIVAS por música por dia UTC (ok + erro).
    if (isDataChange) {
      const { count } = await admin
        .from("artist_song_reports")
        .select("id", { count: "exact", head: true })
        .eq("song_id", songId)
        .eq("trigger_source", "data_change")
        .gte("generated_at", utcMidnight());
      if ((count ?? 0) >= 6) {
        console.log(
          `[${FUNCTION_NAME}] skip ${songId}: data_change_daily_cap (${count} tentativas hoje)`,
        );
        return json({ skipped: true, reason: "data_change_daily_cap", song_id: songId });
      }
    }

    // 1 geração automática por música por dia de calendário UTC (o pedido manual não é travado)
    if (triggerSource === "cron") {
      const since = utcMidnight();
      const { data: existing } = await admin
        .from("artist_song_reports")
        .select("id, generated_at")
        .eq("song_id", songId)
        .eq("status", "ok")
        .gte("generated_at", since)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (existing && existing.length > 0) {
        const r = existing[0];
        console.log(
          `[${FUNCTION_NAME}] skip ${songId}: already generated today (${r.id} at ${r.generated_at})`,
        );
        return json({ ok: true, skipped: "limite de 1 geração automática por dia", song_id: songId });
      }
    }


    if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: triggerSource,
      dry_run: false,
      company_id: song.company_id,
      artist_id: song.artist_id,
    });

    const llm = await callLlm(snapshot);

    const base = {
      company_id: song.company_id,
      song_id: songId,
      artist_id: song.artist_id,
      period_start: periodStart,
      period_end: periodEnd,
      model: MODEL,
      input_snapshot: snapshot,
      generated_by: generatedBy,
      trigger_source: triggerSource,
    };

    if ("fail" in llm && llm.fail) {
      await admin.from("artist_song_reports").insert({
        ...base,
        status: "error",
        error_text: `${llm.fail.error}: ${llm.fail.message}`,
      });
      await finishSyncRun(admin, runId, startedMs, {
        status: "error",
        api_calls: 1,
        rows_written: 1,
        error_text: llm.fail.error,
      });
      return json({ error: llm.fail.error, message: llm.fail.message }, llm.fail.status);
    }

    const { data: inserted, error: iErr } = await admin
      .from("artist_song_reports")
      .insert({
        ...base,
        status: "ok",
        report: llm.report,
        tokens_in: llm.tokens_in,
        tokens_out: llm.tokens_out,
      })
      .select("id, generated_at")
      .single();
    if (iErr) throw new Error(`artist_song_reports: ${iErr.message}`);

    // Limpa a marca só se ninguém a mexeu durante a geração; se entrou dado novo,
    // a marca fica e o cron volta a pegar nela.
    if (isDataChange && staleAt) {
      const { error: clrErr } = await admin
        .from("artist_songs")
        .update({ report_stale_at: null })
        .eq("id", songId)
        .eq("report_stale_at", staleAt);
      if (clrErr) console.warn(`[${FUNCTION_NAME}] limpar report_stale_at falhou: ${clrErr.message}`);
    }

    await finishSyncRun(admin, runId, startedMs, {
      status: "success",
      api_calls: 1,
      rows_written: 1,
      details: {
        song_id: songId,
        report_id: inserted.id,
        tokens_in: llm.tokens_in,
        tokens_out: llm.tokens_out,
        lacunas: snapshot.lacunas.length,
      },
    });

    return json({
      ok: true,
      report_id: inserted.id,
      generated_at: inserted.generated_at,
      model: MODEL,
      period: { inicio: periodStart, fim: periodEnd },
      tokens_in: llm.tokens_in,
      tokens_out: llm.tokens_out,
      report: llm.report,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, { status: "error", error_text: msg });
    return json({ error: msg }, 500);
  }
});
