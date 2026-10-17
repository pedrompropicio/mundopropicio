# #332 — recolha Meta Newgang, passo 4

## Aplicado e verificado — 17/10/2026
- HEADs de partida GitHub/Lovable iguais: `39417128ed0cbfc2f77cda3bfde07f6f92fb9297`; ligação MP indicada pelo Pedro confirmada por SELECT (empresa, conta, enabled).
- Migração canónica `0181_issue332_newgang_meta_audience_source.sql`: novo ramo `newgang_clube:v2`. Assinatura, acesso, ramo Coala e genérico preservados. Remover só o novo ramo reproduz byte-a-byte a fonte anterior.
- Uma linha P_NG27_LISTA inserida com guardas de ligação/duplicação; disabled, replace=true, audience_id_meta=NULL. Nenhuma outra audiência alterada.
- Função testada e Live: MD5 do corpo `759fde0d9791785f0ea2072a017cd8fa`. EXECUTE anon=false, authenticated/service_role=true.

## Elegibilidade
Email obrigatório normalizado lower(btrim); somente MP e evento canónico Newgang 2027. Última captura por email/evento (created_at DESC, id DESC) precisa de consent_email=true e versão clube-newgang-v2. Supressões globais/MP excluem. Telefone só de capturas elegíveis v2 do mesmo evento, priorizando telefone preenchido e mais recente.

## Retirada e limites #322
Lidos `handle-email-unsubscribe/index.ts` (POST grava suppressed_emails) e `portal-track/handler.ts` (consent_email/raw permitidos no lead; false em captura posterior invalida a anterior). A retirada do banner em kind=consent pertence ao ledger marketing_consent_* #322 e não equivale ao descadastro da lista: não foi alterada nem inferida como email opt-out. A página /descadastrar vive no projeto separado e não foi editada; encaminhamento ao handler documentado em portal-newgangfestival.md e confirmado anteriormente pelo Pedro.
Nenhuma escrita em lead_capture, ledger, portal-track ou guardas CAPI. Fixtures apenas em PostgreSQL local descartável, transação ROLLBACK e destruição do cluster, sem TCP.

## Contagens Live (02:37:52–02:38:10 UTC)
- Registos do evento MP: 46.
- consent_email=true: 39 registos.
- Versão clube-newgang-v2: 0 registos.
- Emails elegíveis: 0.
SELECT agregado da expressão aplicada; a ferramenta read-only não pode executar a RPC protegida. Leitura autenticada posterior da RPC HTTP200 devolveu lista vazia (0), sem guardar identidades. Sync com dry_run=true devolveu HTTP400 audience_not_linked_to_meta, antes de qualquer entrega externa.

## Testes
- PostgreSQL17 descartável: 9 filtros genéricos legados + Coala elegibilidade/retirada/fallback/supressão/service/auth/tenant/ACL passaram; Newgang v2, v1, false, supressão MP/global, retirada posterior, outra empresa/evento, normalização e telefone passaram.
- Harness corrigido antes de aplicar: evitar repetir teste Coala que escreve revogação na fixture; repor papel admin no teste Newgang após negativo Coala. Nenhuma falha de produção.
- Vitest focado 8/8; completo 160 ficheiros, 1281 testes passaram; 1 skipped/11 todo preexistentes.
- Build automático OK. CI baseline 39417128: success, run38992566095. CI do commit final deve ser reconfirmada depois da sincronização; nenhum typecheck/build manual executado.

## Falta para ativar (fora desta tarefa)
Publicar o portal com captura v2, criar o público Meta e associar audience_id_meta; revalidar consentimento aplicável e contagem; obter autorização própria para ativar/envio real e eventual cron. TikTok/Google e restante #332 continuam fora desta etapa. Não foi feito Publish, deploy, cron, envio Meta ou backfill de consentimento.
