# #359 (R2) — Prova do texto aceite nas caixas do formulário Coala

Ficheiros lidos: `docs/QUADRO.md` ("Em execução agora"; sem linha coala-portal ativa), `docs/estado/estado-crm-portal-e-leads.md`, `.lovable/memory/constraints/lovable-cloud-ddl-workflow.md`, `.lovable/memory/features/coala-eb-invite.md`, `whatsapp-notifications.md`, `portal-newgangfestival.md` (não há memória própria de lead_capture/portal-track/coala_list_consents), `drizzle/migrations/0196_newgang_crm_members_whatsapp.sql`, `0169_issue321_crm_ingest_counters_on_success.sql`, `supabase/functions/portal-track/handler.ts`.

## Factos confirmados que mudam o desenho
- `contacts.consent_whatsapp_source` tem um CHECK que só aceita `club_profile_whatsapp-v1` e `form_legacy_sem_prova` (0196). Sem o alargar, `form_coala_<versão>` rebenta a ingestão.
- A guarda corre em `contacts` e não vê a captura; quem copia o consentimento da captura para o contacto é `crm_ingest_lead_captures` (versão 0169), que hoje só passa booleanos e `created_at`.
- `portal-track` filtra campos por lista fechada (`FIELDS.lead`); campos novos têm de entrar ali.

## Desenho
1. Tabela de versões com texto exato e sha256 calculado na base (coluna gerada), única por (versão, empresa, locale, canal).
2. Três colunas novas, todas opcionais, na captura. Linhas antigas ficam NULL.
3. `portal-track` aceita os campos novos; valida cada versão contra a tabela (empresa da captura + locale + canal, e vigente na hora do servidor). Inválida/ausente → grava NULL e aviso em `raw.consent_version_warnings`; o lead nunca é rejeitado. `consent_decided_at` = hora do servidor; a do cliente vai para `raw.consent_decided_at_client`.
4. Ingestão: quando a captura tem versão WhatsApp, a ingestão passa ao contacto `consent_whatsapp_source = 'form_coala_<versão>'` e `consent_whatsapp_at = consent_decided_at`. A guarda aceita esse valor só se a versão existir na tabela para a empresa e canal whatsapp; caso contrário cai em `form_legacy_sem_prova` como hoje. O ramo do perfil do Clube mantém prioridade.
5. Não tocar: `crm_whatsapp_eligible` (a regra atual só exclui a origem do Clube, por isso a nova origem comporta-se como a legada), `crm_meta_audience_collect_leads`, `coala_list_members`, P_EB27_LISTA, CAPI, #322, crons, outras funções.

## SQL — migração A (R2): tabela, seed e colunas

```sql
CREATE TABLE public.consent_text_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL CHECK (version ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  locale text NOT NULL CHECK (locale IN ('pt','en')),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  text_sha256 text GENERATED ALWAYS AS (encode(sha256(convert_to(text,'UTF8')),'hex')) STORED,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_text_versions_uniq UNIQUE (version, company_id, locale, channel),
  CONSTRAINT consent_text_versions_window CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX consent_text_versions_lookup ON public.consent_text_versions (company_id, channel, locale, version);
GRANT SELECT ON public.consent_text_versions TO authenticated;
GRANT ALL ON public.consent_text_versions TO service_role;
ALTER TABLE public.consent_text_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_text_versions_read ON public.consent_text_versions
  FOR SELECT TO authenticated USING (public.row_belongs_to_current_company(company_id));
-- Imutável: texto aceite não se reescreve; nova redação = nova versão.
CREATE FUNCTION public._consent_text_versions_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.text IS DISTINCT FROM OLD.text OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.locale IS DISTINCT FROM OLD.locale OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
  THEN RAISE EXCEPTION 'consent_text_version_immutable'; END IF;
  RETURN NEW; -- só valid_to pode ser fechado
END $$;
CREATE TRIGGER consent_text_versions_immutable BEFORE UPDATE OR DELETE ON public.consent_text_versions
  FOR EACH ROW EXECUTE FUNCTION public._consent_text_versions_immutable();

ALTER TABLE public.lead_capture
  ADD COLUMN consent_email_text_version text,
  ADD COLUMN consent_whatsapp_text_version text,
  ADD COLUMN consent_decided_at timestamptz;
```
Sem anon na tabela de versões; `portal-track` lê com service role. Nenhum UPDATE a linhas existentes.

## Seed (DML, via ferramenta de dados, R2 separado)
Empresa = a do Coala, resolvida por query antes do passo (não está nos documentos lidos). Textos byte-exatos; sha256 gerado pela base e devolvido na verificação.
```sql
INSERT INTO public.consent_text_versions (version, company_id, locale, channel, text, valid_from) VALUES
 ('coala-form-2026-10-v1', :coala, 'pt','email',    'Aceito receber comunicações do Coala Festival Portugal — bilhetes, cartaz, experiências e novidades — por email. Posso cancelar quando quiser.', '2026-10-01T00:00:00Z'),
 ('coala-form-2026-10-v1', :coala, 'pt','whatsapp', 'Autorizo o Coala Festival Portugal a enviar-me mensagens por WhatsApp sobre bilhetes, cartaz e novidades do festival. Posso cancelar quando quiser.', '2026-10-01T00:00:00Z'),
 ('coala-form-2026-10-v1', :coala, 'en','email',    'I agree to receive communications from Coala Festival Portugal — tickets, line-up, experiences and news — by email. I can unsubscribe anytime.', '2026-10-01T00:00:00Z'),
 ('coala-form-2026-10-v1', :coala, 'en','whatsapp', 'I authorise Coala Festival Portugal to send me WhatsApp messages about tickets, line-up and festival news. I can unsubscribe anytime.', '2026-10-01T00:00:00Z');
```
Prova: sha256 também calculado fora da base (Deno) sobre as strings do pedido e comparado com `text_sha256`.

## SQL — migração B (R2): origem WhatsApp

```sql
ALTER TABLE public.contacts DROP CONSTRAINT contacts_consent_whatsapp_source_check; -- nome confirmado por query antes
ALTER TABLE public.contacts ADD CONSTRAINT contacts_consent_whatsapp_source_check
  CHECK (consent_whatsapp_source IN ('club_profile_whatsapp-v1','form_legacy_sem_prova')
         OR consent_whatsapp_source ~ '^form_coala_[a-z0-9][a-z0-9-]{2,63}$');

CREATE OR REPLACE FUNCTION public._crm_whatsapp_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE latest record;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.consent_whatsapp,NEW.consent_whatsapp_at,NEW.consent_whatsapp_source)
 IS NOT DISTINCT FROM (OLD.consent_whatsapp,OLD.consent_whatsapp_at,OLD.consent_whatsapp_source) THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(NEW.id,NEW.company_id);
 IF FOUND THEN
  NEW.consent_whatsapp:=latest.decision='granted';
  NEW.consent_whatsapp_at:=CASE WHEN latest.decision='granted' THEN latest.decided_at END;
  NEW.consent_whatsapp_source:='club_profile_whatsapp-v1';
 ELSIF NEW.consent_whatsapp THEN
  IF NEW.consent_whatsapp_source LIKE 'form_coala_%' AND EXISTS (
     SELECT 1 FROM public.consent_text_versions v
     WHERE v.company_id=NEW.company_id AND v.channel='whatsapp'
       AND 'form_coala_'||v.version = NEW.consent_whatsapp_source) THEN
    NULL; -- versão provada, mantém
  ELSE
    NEW.consent_whatsapp_source:='form_legacy_sem_prova';
  END IF;
 ELSE NEW.consent_whatsapp_at:=NULL; NEW.consent_whatsapp_source:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_whatsapp_contact_guard() FROM PUBLIC,anon,authenticated,service_role;
```
Mais `CREATE OR REPLACE public.crm_ingest_lead_captures` copiado byte-a-byte da 0169 com uma única alteração nos ramos INSERT/UPDATE de contacts: `consent_whatsapp_at = coalesce(lc.consent_decided_at, lc.created_at)` e `consent_whatsapp_source = CASE WHEN lc.consent_whatsapp AND lc.consent_whatsapp_text_version IS NOT NULL THEN 'form_coala_'||lc.consent_whatsapp_text_version END`. Guarda md5 do corpo atual no início da migração (molde 0196: aborta com `source_drift`). ACL da função preservada.

## portal-track (R2, deploy só desta função)
- `handler.ts`: `FIELDS.lead` + `consent_email_text_version: 64`, `consent_whatsapp_text_version: 64`, `consent_locale: 5` (vai para raw), `consent_decided_at` (cliente → `raw.consent_decided_at_client`).
- Nova função pura `resolveConsentVersions(input, lookup)` em `supabase/functions/portal-track/consent-versions.ts`: valida empresa+locale+canal+vigência; devolve colunas e avisos. Lookup injetado (testável sem rede).
- Só preenche versão se a caixa respetiva veio `true`; caixa falsa → versão NULL. `consent_decided_at` = `new Date()` do servidor quando há pelo menos uma versão válida.
- Contrato #322 (`consent_event_id`), fallback de insert anónimo e geo intactos; falha do lookup → NULL + aviso, nunca 4xx.

## Testes
- Vitest: `src/test/portal-track-consent-versions.test.ts` — versão válida PT/EN; desconhecida → NULL+aviso, lead 200; ausente (portal atual) → payload igual ao de hoje; locale errado; caixa falsa com versão; hora do cliente só em raw; geo e `consent_event_id` inalterados.
- Teste PGlite das migrações A/B: CHECK aceita/rejeita, imutabilidade, guarda (versão válida → `form_coala_…`; inventada → legado; perfil do Clube prevalece), ingestão com e sem versão.
- tsgo + Deno check + suite completa (baseline e final).
- Live (só leitura): colunas, constraints, policies, grants, 4 linhas seed e sha256; captura sintética dentro de `BEGIN … ROLLBACK` via ferramenta de dados, se a ferramenta o permitir; caso contrário fica só o PGlite e digo-o.

## Rollback (`supabase/manual/rollback_359.sql`, não aplicado)
Repor guarda e ingestão com os corpos da 0196/0169 (byte-exatos); repor CHECK antigo (falha se já houver contactos `form_coala_…` — nesse caso, antes, autorização própria para os passar a `form_legacy_sem_prova`); colunas e tabela ficam (remoção exige autorização separada, é destrutivo). portal-track: redeploy do commit anterior.

## Riscos
- Portal sem enviar versão = zero efeito (tudo NULL, origem legado).
- Mudança de texto no portal sem nova versão gera prova falsa — regra: nova redação ⇒ nova versão.
- Ingestão é função crítica (#321); por isso cópia byte-a-byte + guarda md5.

## Ordem e passos R2
1. R1: código portal-track + testes + PGlite + ficheiros rollback (sem deploy). 
2. R2 "Sim": migração A.
3. R2 "Sim": seed (DML) e verificação sha256.
4. R2 "Sim": migração B (CHECK + guarda + ingestão).
5. R2 "Sim": deploy só `portal-track`. 
6. R0: fecho documental. Integração no portal Coala (outro projeto) fica fora desta Issue.

## Perguntas em aberto
- Locale: o portal envia `pt`/`en`? Recomendo campo `consent_locale` no payload (opção A, recomendada) vs inferir pela versão (B).
- `valid_from` da v1: 01/10/2026 (recomendado) ou hora do seed.
- Origem do email: fica só na captura (recomendado) ou também criar `consent_email_source` nos contactos (nova DDL)?
