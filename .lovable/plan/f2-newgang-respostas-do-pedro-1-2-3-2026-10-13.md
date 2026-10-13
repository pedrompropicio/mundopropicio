# F2 Newgang — respostas do Pedro (1, 2, 3)

## 1. Desligar portal_vip_welcome para clube_newgang
- `CREATE OR REPLACE FUNCTION public.tg_lead_capture_vip_welcome()` (versão actual de 20260820154927), com uma única linha nova junto à salvaguarda "coala%": `IF NEW.source = 'clube_newgang' THEN RETURN NEW; END IF;`
- Restantes fontes ficam iguais (corpo copiado tal como está).

## 2. Envio imediato (rede de segurança mantém-se)
Função alterada: `public.club_from_lead_capture()` (trigger `trg_club_from_lead_capture`, AFTER UPDATE OF processed em lead_capture). Sem DDL em tabelas, sem trigger novo.
- Depois de `club_upsert_member(..., 'formulario')`, se o membro foi criado agora e está por confirmar, faz `net.http_post` para `newgang-portal` com `{action:"notify_pending", member_id}` e Bearer da chave de serviço lida do vault (o mesmo segredo do cron).
- Nunca bloqueia: `pg_net` é assíncrono (só enfileira o pedido; o HTTP sai depois do commit, noutro processo). Todo o bloco fica em `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END`, por isso uma falha (vault, pg_net, função em baixo) não falha a inscrição.
- Idempotente: `notify_pending` passa a aceitar `member_id` opcional e reaproveita a lógica actual — só envia a membros por confirmar, source formulario, sem welcome já enviado; o id de mensagem `ng-welcome-<membro>` impede duplicados na fila. Se trigger e cron chegarem ao mesmo tempo, só um envia.
- Cron `newgang-club-welcome-5m` fica igual, como rede de segurança.

## 3. Descadastro no site novo
- `newgang-portal/index.ts`: link visível nos emails Newgang (welcome, access e os do Clube) passa a `https://newgangfestival.pt/descadastrar?token=…`. Cabeçalho List-Unsubscribe de um clique continua a apontar para `handle-email-unsubscribe`.
- `handle-email-unsubscribe` já responde com `Access-Control-Allow-Origin: *`, logo aceita newgangfestival.pt, o preview e newgang-fest-portal.lovable.app sem alterações. Provo com OPTIONS/POST das três origens.

## Ordem e testes
1. Migração tracked (só CREATE OR REPLACE das 2 funções) + cópia em supabase/migrations.
2. Alterar e publicar newgang-portal.
3. Teste com teste+ngmail2@mundopropicio.com via portal-track (Origin newgangfestival.pt): confirmar 0 portal_vip_welcome, 1 newgang_club_welcome "sent", link de descadastro novo, +100 ao abrir sessão, e tempo inscrição → processed → sent.
4. Limpar dados de teste; actualizar spec, estado e memória. Sem Publish.

Nota: o processamento das inscrições continua a correr de 1 em 1 a 5 minutos (cron das inscrições); "imediato" = logo após esse processamento.
