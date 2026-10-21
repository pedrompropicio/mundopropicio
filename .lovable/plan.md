# Visão comparativa de tráfego — Fase 1, preparação

## Estado e âmbito
Só preparação. Nenhum DDL/DML aplicado, nenhum backfill, cron, API autenticada, deploy ou Publish executado. Proposta SQL inerte guardada em `supabase/manual/20261021_artist_ads_hourly_fase1.INERTE.sql`; após autorização, copiar byte a byte para a próxima migração livre (0218 é candidata, não reservada), pelo fluxo oficial de migrações. Não colocar agora numa pasta de aplicação automática.

Leitura Cloud de 21/10: duas ligações Meta, duas TikTok e uma Google de artista ativas com conta selecionada. GitHub e repositório têm o mesmo HEAD `e3c620ad521ba7edecaa3aaa2d5525cea4358a86`. Nenhuma alteração a QUADRO, Issues, memória, código existente ou schema existente.

Incoerência documental: o pedido referido não consta do QUADRO disponível; a secção 6 chama-se Vínculo BP-Transações, e Tráfego Pago é a 8. A autorização desta mensagem basta para preparar; não remapear chats nesta tarefa.

## 1. Meta Android/iOS
Usar **impression_device**, não device_platform (este só mobile/desktop). Guardar as categorias originais em `crm.ads_insights_breakdown_daily`, `breakdown='device'`, `level='campaign'` e `level='adset'`. `raw` mínimo inclui `breakdown_source='impression_device'`; valores inequivocamente Android/Apple móvel são classificados como Android/iOS, desktop/outros/desconhecidos permanecem separados. Não inferir OS de “mobile”, nem Mac=iOS.

O CHECK breakdown já aceita `device`; o CHECK level já aceita campaign/adset. O UNIQUE inclui ligação/plataforma/nível/IDs/data/breakdown/valor: **nenhum CHECK ou índice existente precisa de alteração**. ACL atual da tabela: só owner e service_role; RLS ligada. Código atual só recolhe quatro grupos, ao nível campanha (`crm-meta-sync-insights/index.ts:230–236,302,411`); acrescentar no futuro duas consultas de dispositivo por conta, cobrindo todas as campanhas (mesmo conjunto único e sem música ligada), sem filtro de número de conjuntos. Não somar campanha e conjuntos.

Aviso oficial desde 06/08/2026: impression_device pode não estar disponível na resposta síncrona de certas contas. Relatório assíncrono como alternativa; sem ativar opções no Ads Manager nesta fase. Falta de dados não é zero nem Android/iOS presumido.

## 2. Série horária e dados mínimos
Nova `crm.ads_insights_hourly`, apenas ligações de ARTISTA. Níveis normalizados campaign/adset; TikTok adgroup e Google ad_group mapeiam para adset, preservando origem no raw. Chave natural inclui conta e fuso para não misturar troca de conta ou alteração de timezone. Data/hora são civis da conta; a hora repetida no fim do horário de verão fica no bucket agregado que a API entrega, não se inventa um instante UTC distinto.

Meta: hourly_stats_aggregated_by_advertiser_time_zone + time_increment=1, por campanha e conjunto. Não pedir reach/frequency/unique_*/video_* neste caminho. Dispositivo diário e hora são marginais independentes; não fabricar Android/iOS por hora.
TikTok: stat_time_hour em BASIC, campaign_id/AUCTION_CAMPAIGN e adgroup_id/AUCTION_ADGROUP, sujeitos à matriz de suporte da conta/API. Paginação completa; nunca reproduzir o corte silencioso atual em 50 páginas.
Google: GAQL com segments.date, segments.hour, customer.time_zone/currency_code; relatórios campaign e ad_group separados, por conta cliente. spend_cents = round(cost_micros/10000), guardando micros originais mínimos para auditar arredondamento.

Sem coluna LPV nesta fase (fase 2): apenas raw allowlist com LPV/link_clicks quando efetivamente fornecidos, discriminando unsupported/absent/available. Não prometer LPV off-Meta horário: há restrições oficiais. Não guardar payload inteiro, tokens, URLs autenticadas ou dados pessoais. Null ≠ zero.

## 3. Hoje, fuso e agendamento
Um instante de referência por corrida; hoje = data no **fuso da conta**, nunca browser/UTC/Lisboa por omissão. Meta timezone_name, TikTok timezone/display_timezone normalizado, Google customer.time_zone. Fuso inválido/desconhecido: erro explícito; não fallback silencioso UTC. Esta é lógica de anúncios, não altera a regra Europe/Lisbon das vendas.

Um único job futuro por artista, **duas vezes por dia: 12:00 e 22:00 de Brasília (America/Sao_Paulo), correspondentes a 15:00 e 01:00 UTC**. Expressão futura UTC: `0 1,15 * * *`. Meta+TikTok+Google, sem catálogos, autolinks nem alertas. Ambas as corridas recolhem hoje por hora e o marginal diário device da Meta. A corrida das **12:00 de Brasília / 15:00 UTC fecha também D−1 inteiro**, horas 0–23 nas três plataformas e Android/iOS diário da Meta, porque as horas 22–23 só ficam completas no dia seguinte. Hoje e D−1 são sempre definidos no fuso de cada conta, não no dia UTC ou de Brasília. A corrida das 01:00 UTC é a das 22:00 de Brasília do dia civil anterior. Recolher D−1 é fecho programado, não reexecutar o backfill de 30 dias. Crons/histórico atuais mantêm-se, incluindo o sync Meta horário de métricas diárias — “hourly” no nome atual significa frequência, não granularidade dos dados.

O intervalo agendado deixa de ser de 30 minutos: passa a 10h/14h entre corridas, com atualização manual disponível e possível atraso adicional de consolidação da plataforma. D−1 deve ser integralmente paginado; ausência/atraso da API não permite declarar o fecho completo nem preencher zeros. Retenção: job SQL diário consolidado das novas séries, não dois jobs independentes por plataforma. Cron a instalar separadamente pelo 0; **nenhum cron no DDL abaixo**.

Retenção conserva hoje e D−1…D−29 por fuso guardado: futuramente `DELETE FROM crm.ads_insights_hourly WHERE metric_date < (now() AT TIME ZONE account_timezone)::date - 29`. Limpeza diária pode reter até cerca de 24h adicionais antes da remoção. Não apagar breakdown diário existente nem controlo/histórico anterior.

## 4. Atualizar agora por artista
Nova edge futura `artist-ads-refresh-today` usa `_shared/artist-access.ts` e D-ERP259: sessão obrigatória + `artist_access_check(artist,'read','traffic')`; permite quem pode ler Tráfego, sem conceder editar orçamentos/contas. Não usar os coletores antigos que exigem ADS_ROLES como autorização para externos.

`artist_ads_refresh_claim` no caminho manual é chamada pela edge **com JWT do utilizador**, antes de resolver tokens; só p_artist_id e p_scheduled, empresa/contas calculadas no servidor. Limite durável global por artista: uma aceitação manual em 120s, mesmo vários utilizadores/instâncias. No caminho agendado, validar explicitamente `auth.role()='service_role'`, obter `company_id` diretamente de `public.artists` para artista ativo, com lock; **não chamar artist_access_check nem exigir auth.uid()**, ausente no JWT de serviço. O caminho manual mantém sessão e `artist_access_check(artist,'read','traffic')` inalterados. Cron e manual partilham lease, para não correr simultaneamente. 429 + retry_after para limite; 202 para corrida já em curso. Falha não devolve a janela manual, evitando tempestades.

`artist_ads_refresh_finish` só serviço, request_id e lease conferidos. Resposta contém last_synced_at global (última corrida integral bem-sucedida) e por plataforma (parciais/falhas explícitas). Conta desligada não é falha de plataforma ligada. Não usar max dos timestamps para declarar tudo atualizado. Lease de 5 min com teto futuro de trabalho de 110s; upserts futuros têm de ser fenced pelo request_id ativo e revalidados antes da escrita, impedindo worker antigo de sobrescrever worker novo. Esta edge e o writer fenced **não são implementados por este DDL**.

## 5. Backfill e custo
Dispositivo Meta: **30 datas D−29…D**, campanha e conjunto, por conta; uma consulta lógica de 30 dias por nível se volume permitir, senão blocos menores, paginação/async. Meta horário: **até 14 datas D−13…D**, por nível; a documentação permite 13 meses, mas este pedido limita a recolha a 14 dias. TikTok: tentar até 14 datas, uma por pedido e nível; a retenção horária exata e LPV têm de ser confirmadas na documentação da conta — não prometo 14 dias recuperáveis sem essa confirmação. Lacunas ficam documentadas, não preenchidas. Google: backfill horário também até 14 datas se quota permitir, sem reescrever diário legado.

Contagem base com as 5 ligações já observadas, sem nova consulta nesta revisão e antes de páginas/retries/metadados: por data Meta 2 contas × (2 hora + 2 device) = 8; TikTok 2 × 2 hora = 4; Google 1 × 2 hora = 2 operações. **Consultas separadas por data**, para o mesmo caminho por dia: às 12:00 Brasília, hoje + D−1 = **28**; às 22:00, só hoje = **14**. Total **42 consultas lógicas/dia** (Meta **24**, TikTok **12**, Google **6**), em vez de 672/dia: redução de 93,75%. Não é 1 pedido por campanha. Manual: **8 por artista com 1 Meta+1 TikTok+1 Google** (4+2+2), apenas hoje; total real depende das ligações desse artista. Limite teórico de 720 pedidos manuais aceites/dia/artista, não previsão de uso. Não descontar possíveis otimizações de intervalos nem confundir consultas lógicas com chamadas HTTP efetivas.

Backfill base: Meta device 4 consultas + hora 4; TikTok 2 contas × 2 níveis × 14 dias = 56; Google 2: **66 consultas lógicas** antes de paginação; async acrescenta criação/polls/resultados. Uma consulta GAQL SearchStream conta uma operação; conta não comprovada para nível de acesso do projeto. Google **6/dia** deste novo job é baixo face aos limites públicos, mas partilha quota com o resto da integração.

Rate limits: coordenação persistente por conta entre manual/cron/backfill, serialização de relatórios, concorrência baixa, medir cada página HTTP (contador atual Meta subconta páginas). Headers Meta X-App-Usage/X-Ad-Account-Usage/X-Business-Use-Case-Usage e Retry-After; TikTok limites do endpoint/app e códigos de throttling; Google RESOURCE_EXHAUSTED/query_resource_consumption. Retry com jitter limitado e retoma por cursor, sem busy loop nem job permanente de retry. Números absolutos de quota real do projeto não foram lidos: não inventar. Custos monetários Cloud não estimáveis só pelo número de chamadas.

## 6. Conferência e aplicação futura
Antes: confirmar objetos novos ausentes, definição/ACL/índices/RLS da tabela reutilizada, definição e hash/ACL de artist_access_check, papéis sandbox, owners e default ACL. SQL tem pré-condições e guardas de grants diretos e efetivos por herança; não muda grants globais/esquemas. Depois: comparar snapshots dos objetos anteriores byte a byte; confirmar novas tabelas vazias, RLS on/zero policies, tabela/coluna sem anon/authenticated/sandbox, claim authenticated+service_role, finish só service_role, trigger owner/serviço. Guardas abortam a transação perante grants herdados inesperados; não “corrigir” role global.

DDL analisado sintaticamente por parser PostgreSQL; **não executado nem validado funcionalmente em PG local/Cloud**. Na aplicação futura: testes locais de 120s, concorrência, empresa/área, falsa flag scheduled, service_role sem auth.uid(), artista inativo/inexistente, stale worker, troca de conta/fuso, null/zero, paginação, backfill inclusivo, horários 15:00/01:00 UTC e D−1 integral apenas na corrida das 15:00, e preservação dos relatórios antigos; CI verde antes de deploy não corretivo. Correções de 21/10 aprovadas apenas para preparação; próxima etapa depende de ordem expressa para aplicar o SQL exato abaixo.

## Referências oficiais
- Meta: https://developers.facebook.com/docs/marketing-api/insights/breakdowns/
- TikTok: https://business-api.tiktok.com/portal/docs/run-a-synchronous-report/v1.3
- TikTok dimensões: https://business-api.tiktok.com/portal/docs/basic-reports-supported-dimensions/v1.3
- Google segmentos: https://developers.google.com/google-ads/api/docs/reporting/segmentation
- Google quotas: https://developers.google.com/google-ads/api/docs/best-practices/quotas

## DDL exato — INERTE, um bloco transacional
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Pré-condições: objetos novos ausentes; não reescrever objetos existentes.
DO $pre$
BEGIN
  IF to_regclass('crm.ads_insights_hourly') IS NOT NULL
     OR to_regclass('public.artist_ads_refresh_control') IS NOT NULL
     OR to_regprocedure('public.artist_ads_refresh_claim(uuid,boolean)') IS NOT NULL
     OR to_regprocedure('public.artist_ads_refresh_finish(uuid,uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('crm.ads_hourly_validate_connection()') IS NOT NULL THEN
    RAISE EXCEPTION 'fase1: objetos já existem; rever definição/ACL antes de aplicar';
  END IF;
  IF to_regprocedure('public.artist_access_check(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fase1: falta autorização canónica D-ERP259';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.ads_insights_breakdown_daily'::regclass
    AND conname='ads_insights_breakdown_daily_breakdown_check'
    AND pg_get_constraintdef(oid) LIKE '%''device''%')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.ads_insights_breakdown_daily'::regclass
    AND conname='ads_insights_breakdown_daily_level_check'
    AND pg_get_constraintdef(oid) LIKE '%''adset''%') THEN
    RAISE EXCEPTION 'fase1: drift no contrato diário';
  END IF;
END $pre$;

CREATE TABLE crm.ads_insights_hourly (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','tiktok','google')),
  ad_account_id text NOT NULL CHECK (length(btrim(ad_account_id)) > 0),
  level text NOT NULL CHECK (level IN ('campaign','adset')),
  external_campaign_id text NOT NULL CHECK (length(btrim(external_campaign_id)) > 0),
  external_adset_id text NOT NULL DEFAULT '',
  account_timezone text NOT NULL CHECK (length(btrim(account_timezone)) > 0),
  metric_date date NOT NULL,
  metric_hour smallint NOT NULL CHECK (metric_hour BETWEEN 0 AND 23),
  spend_cents bigint CHECK (spend_cents >= 0),
  impressions bigint CHECK (impressions >= 0),
  clicks bigint CHECK (clicks >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(raw)='object' AND octet_length(raw::text)<=8192),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level='campaign' AND external_adset_id='')
      OR (level='adset' AND length(btrim(external_adset_id))>0)),
  PRIMARY KEY (connection_id,platform,ad_account_id,account_timezone,level,
               external_campaign_id,external_adset_id,metric_date,metric_hour)
);
REVOKE ALL ON crm.ads_insights_hourly FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ads_insights_hourly TO service_role;
ALTER TABLE crm.ads_insights_hourly ENABLE ROW LEVEL SECURITY;
-- Sem policies: sem acesso direto de utilizadores. Leituras futuras por RPC D-ERP259.
CREATE INDEX ads_insights_hourly_company_date_idx
  ON crm.ads_insights_hourly(company_id,metric_date,platform);

CREATE TABLE public.artist_ads_refresh_control (
  artist_id uuid PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  last_requested_at timestamptz,
  last_started_at timestamptz NOT NULL,
  lease_until timestamptz,
  request_id uuid,
  last_synced_at timestamptz,
  platform_results jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(platform_results)='object' AND octet_length(platform_results::text)<=8192)
);
REVOKE ALL ON public.artist_ads_refresh_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_ads_refresh_control TO service_role;
ALTER TABLE public.artist_ads_refresh_control ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION crm.ads_hourly_validate_connection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE c record;
BEGIN
  SELECT company_id,platform,connection_scope,artist_id,selected_ad_account_id
    INTO c FROM crm.ad_platform_connections WHERE id=NEW.connection_id FOR SHARE;
  IF NOT FOUND OR c.company_id IS DISTINCT FROM NEW.company_id
     OR c.platform IS DISTINCT FROM NEW.platform OR c.connection_scope<>'artist'
     OR c.artist_id IS NULL OR c.selected_ad_account_id IS DISTINCT FROM NEW.ad_account_id THEN
    RAISE EXCEPTION 'hourly: ligação/empresa/plataforma/conta incompatíveis' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.account_timezone) THEN
    RAISE EXCEPTION 'hourly: fuso da conta inválido' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION crm.ads_hourly_validate_connection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ads_hourly_validate_connection
  BEFORE INSERT OR UPDATE ON crm.ads_insights_hourly
  FOR EACH ROW EXECUTE FUNCTION crm.ads_hourly_validate_connection();

-- Manual: JWT do utilizador. Agendado: service_role sem auth.uid(), artista ativo.
CREATE FUNCTION public.artist_ads_refresh_claim(p_artist_id uuid,p_scheduled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE v_company uuid; v_now timestamptz:=clock_timestamp(); v_id uuid:=gen_random_uuid();
        v_row public.artist_ads_refresh_control%ROWTYPE;
BEGIN
  IF p_scheduled IS NULL THEN RAISE EXCEPTION 'p_scheduled obrigatório'; END IF;
  IF p_scheduled THEN
    IF coalesce(auth.role(),'')<>'service_role' THEN
      RAISE EXCEPTION 'sync agendado reservado ao serviço' USING ERRCODE='42501';
    END IF;
    SELECT a.company_id INTO v_company FROM public.artists a
      WHERE a.id=p_artist_id AND a.status='ativo' AND a.company_id IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'artista ativo inexistente ou sem empresa' USING ERRCODE='42501';
    END IF;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE='42501'; END IF;
    v_company:=public.artist_access_check(p_artist_id,'read','traffic');
    -- Lock por artista: permissão manual validada antes de consumir o limite.
    PERFORM 1 FROM public.artists WHERE id=p_artist_id AND company_id=v_company FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'artista alterado' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.artist_ads_refresh_control(artist_id,company_id,last_started_at)
    VALUES(p_artist_id,v_company,v_now) ON CONFLICT(artist_id) DO NOTHING;
  SELECT * INTO v_row FROM public.artist_ads_refresh_control WHERE artist_id=p_artist_id FOR UPDATE;
  IF v_row.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'empresa do artista alterada; rever controlo' USING ERRCODE='42501';
  END IF;
  IF v_row.lease_until>v_now THEN
    RETURN jsonb_build_object('accepted',false,'reason','in_progress',
      'retry_after_seconds',ceil(extract(epoch FROM v_row.lease_until-v_now)),
      'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
  END IF;
  IF NOT p_scheduled AND v_row.last_requested_at>v_now-interval '2 minutes' THEN
    RETURN jsonb_build_object('accepted',false,'reason','rate_limited',
      'retry_after_seconds',ceil(extract(epoch FROM v_row.last_requested_at+interval '2 minutes'-v_now)),
      'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
  END IF;
  UPDATE public.artist_ads_refresh_control SET request_id=v_id,last_started_at=v_now,
    lease_until=v_now+interval '5 minutes',
    last_requested_at=CASE WHEN p_scheduled THEN last_requested_at ELSE v_now END
    WHERE artist_id=p_artist_id;
  RETURN jsonb_build_object('accepted',true,'request_id',v_id,'company_id',v_company,
    'lease_until',v_now+interval '5 minutes','last_synced_at',v_row.last_synced_at,
    'platforms',v_row.platform_results);
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_refresh_claim(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_refresh_claim(uuid,boolean) TO authenticated,service_role;

-- Só o serviço fecha o pedido; resultados não contêm tokens/raw/identificadores pessoais.
CREATE FUNCTION public.artist_ads_refresh_finish(p_artist_id uuid,p_request_id uuid,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE v_row public.artist_ads_refresh_control%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'fecho reservado ao serviço' USING ERRCODE='42501';
  END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results)<>'object' OR octet_length(p_results::text)>8192
     OR EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.key NOT IN ('meta','tiktok','google')
       OR jsonb_typeof(e.value)<>'object' OR coalesce(e.value->>'status','') NOT IN ('success','partial','error','not_connected'))
     OR EXISTS(SELECT 1 FROM jsonb_each(p_results) e,
       LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(e.value)='object' THEN e.value ELSE '{}'::jsonb END) k
       WHERE k NOT IN ('status','last_synced_at','rows_written','api_calls','reason')) THEN
    RAISE EXCEPTION 'resultados inválidos';
  END IF;
  SELECT * INTO v_row FROM public.artist_ads_refresh_control WHERE artist_id=p_artist_id FOR UPDATE;
  IF NOT FOUND OR p_request_id IS NULL OR v_row.request_id IS DISTINCT FROM p_request_id
     OR v_row.lease_until IS NULL OR v_row.lease_until<=v_now THEN
    RETURN jsonb_build_object('accepted',false,'reason','stale_request');
  END IF;
  UPDATE public.artist_ads_refresh_control SET lease_until=NULL,request_id=NULL,
    platform_results=p_results,
    last_synced_at=CASE WHEN EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.value->>'status'='success')
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.value->>'status' IN ('partial','error'))
      THEN v_now ELSE last_synced_at END WHERE artist_id=p_artist_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('accepted',true,'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_refresh_finish(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_refresh_finish(uuid,uuid,jsonb) TO service_role;

-- Revogações explícitas dos dois nomes sandbox existentes e de variantes futuras.
DO $acl$
DECLARE r record; t text; f text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP
    FOREACH t IN ARRAY ARRAY['crm.ads_insights_hourly','public.artist_ads_refresh_control'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',t,r.rolname);
    END LOOP;
    FOREACH f IN ARRAY ARRAY['crm.ads_hourly_validate_connection()',
      'public.artist_ads_refresh_claim(uuid,boolean)','public.artist_ads_refresh_finish(uuid,uuid,jsonb)'] LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname);
    END LOOP;
  END LOOP;
  -- Não alterar default privileges, esquemas ou grants dos objetos anteriores.
  IF EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('crm.ads_insights_hourly'::regclass,'public.artist_ads_refresh_control'::regclass)
      AND a.grantee NOT IN (c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    OR EXISTS(SELECT 1 FROM pg_attribute a,LATERAL aclexplode(a.attacl) x
    WHERE a.attrelid IN ('crm.ads_insights_hourly'::regclass,'public.artist_ads_refresh_control'::regclass)
      AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='service_role')) THEN
    RAISE EXCEPTION 'fase1: ACL inesperada em tabela/coluna';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolname IN ('anon','authenticated') OR r.rolname='sandbox_exec'
      OR r.rolname LIKE 'sandbox_exec_%') AND (has_table_privilege(r.oid,'crm.ads_insights_hourly','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege(r.oid,'public.artist_ads_refresh_control','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
    RAISE EXCEPTION 'fase1: acesso efetivo inesperado, incluindo herança';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid IN
    ('crm.ads_hourly_validate_connection()'::regprocedure,'public.artist_ads_refresh_claim(uuid,boolean)'::regprocedure,
     'public.artist_ads_refresh_finish(uuid,uuid,jsonb)'::regprocedure)
    AND a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'),
      CASE WHEN p.proname='artist_ads_refresh_claim' THEN (SELECT oid FROM pg_roles WHERE rolname='authenticated') ELSE p.proowner END)) THEN
    RAISE EXCEPTION 'fase1: ACL inesperada em função';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolname='anon' OR r.rolname='sandbox_exec'
      OR r.rolname LIKE 'sandbox_exec_%') AND
    (has_function_privilege(r.oid,'public.artist_ads_refresh_claim(uuid,boolean)','EXECUTE')
     OR has_function_privilege(r.oid,'public.artist_ads_refresh_finish(uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege(r.oid,'crm.ads_hourly_validate_connection()','EXECUTE')))
    OR has_function_privilege('authenticated','public.artist_ads_refresh_finish(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','crm.ads_hourly_validate_connection()','EXECUTE') THEN
    RAISE EXCEPTION 'fase1: EXECUTE efetivo inesperado, incluindo herança';
  END IF;
END $acl$;
COMMIT;
```
