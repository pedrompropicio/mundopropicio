# #333 — prévia concreta da fase seguinte; NÃO executar

## Gates e autorizações independentes

1. Pedro/revisão independente verifica hashesPATCH/core/índice em10 e07/08/11; CI no novo SHA + sincronização #329. Uma janela, um escritor; #323 dados/docs intactos. Política trimSPACE+caixaASCII ainda proposta; aprovar política antes de índice.
2. Protocolo persistente preparado e testado em14–16, ainda não aplicado. Gate adicional ANTES de aplicação: decidir claim persistente de tentativa/reconciliação legada para chave incompleta. Recomendado preparar adapter de reserva/readback servidor isolado, sem DELETE/retry automático. Alternativa: aplicação restrita com bloqueio explícito de operações incompletas (muda contrato legado, exige decisão Pedro). Não executar compatibilidade enquanto não definido alcance desse bloqueio; sessionStorage não substitui idempotência global.
3. Comparar versões exatas de dependências Deno/lock offline; verificar deploy real e configuração runtime apenas depois de autorização própria. Nenhuma permissão ampliada.

## Ordem proposta — compatibilidade antes do índice

A. Capturar hashes e cópia dos 14 destinos do manifesto atual; revalidar manifestBASE com HEAD aprovado. Aplicar patch exclusivamente na janela AUTORIZADA; core continua manual e upload/executefalse. Reexecutar tipos/build/integrados38+entrada7/PG60/handler20/suíte1334, comparar diff só escopo. Autorizar deploy ingest separado se necessário; publicação frontend separada explicitamente (nunca implícita). Verificar comportamento antes de avançar.
B. Com escritores parados/contidos e autorização read-only: repetir preflight agregado sem PII (grupos fortes, chaves incompletas, catálogo/definição/validade índice canónico). O strongconflictgroups0 anterior NÃO autoriza criação nem prova ausência futura. Conflitos → PARAR/revisão privada, nenhum merge/delete/backfill.
C. Somente com aprovação política+índice: executar SQL exato em `supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql` por mecanismo de schema autorizado, `CREATE UNIQUE INDEX CONCURRENTLY` fora de transação; se gateway de migrations não suportar, PARAR e pedir mecanismo compatível, nunca SQL direto improvisado. Compatibilidade já validada/deployada antes. Verificar catálogo `indisvalid/indisready` e definição exata; leituras/23505 controlados em fixtures técnicas autorizadas, não lote323.
D. Só depois de gates de storage/ACL, definir aplicação de core técnico aditivo/buckets/endpoints #333 via autorização separada. Não ativar upload/execute até revisão completa; outras moedas do assistente continuam indisponíveis.

## Falha/rollback

- Patch rejeitado/hash divergente: PARAR, preservar ambos; não force/reset/rebase. Restaurar arquivos-base apenas por patch inverso revisado autorizado, não excluir alterações alheias.
- Compatibilidade falha antes índice: manter recursos fechados, rollback separado autorizado, nada financeiro apagado.
- Índice inválido após falha CONCURRENTLY: não reexecutar cegamente/IF NOT EXISTS. Ler catálogo agregado; identificar só `uq_standalone_invoice_normalized_333`. `DROP INDEX CONCURRENTLY` somente com autorização; preservar índice canónico/dados. Repetir conflitos com escritores contidos antes nova tentativa.
- Índice válido já instalado: remover proteção antes de rollback para legado vulnerável é risco; janela coordenada/stop writers e autorização explícita. Não baixar política/ACL nem limpar candidatos para facilitar rollback.

## Prova StorageACL real futura — sem faturas

Autorização específica para criar/usar buckets/caminhos de TESTE privados e identidades fictícias owner/mesmaempresa/outraempresa, sessões técnicas próprias. Prefixos exclusivos company/session/runUUID, bytes PDF/PNG/JPEG fictícios; nunca standalone invoice/TX/BP/email/provider. Testar anon/owner/outrotenant leitura/list/upload/copy/conflito/readback SHA256, tamanho/MIME, overwritefalse, resultadounknown. JWT/Auth reais apenas origin interno, sem logar tokens. Registrar ACL/SQL exatos e contagens técnicas agregadas antes/depois; nenhuma alteração global de política para o teste passar.

Provar ownership/reserva atómica e zero referências no mesmo mecanismo antes de eventual limpeza. Na ausência de prova atómica: MANTER candidatos privados e relatar caminhos exclusivos de forma privada; sem check-then-delete, cron ou cleanup automático. A autorização de teste NÃO autoriza apagar.

## Efeitos/custos e limites

Preparação local: sem chamadas cobradas, nenhum provider/documento real. Próxima fase poderá consumir storage de poucos fixtures (limite proposto 20MiB/item), chamadas Auth/storage e recursos do índice sobre a tabela real; custo exato/tempo/impacto de locks dependem de volume e plano Cloud, ainda não medidos. Não prometer custo zero em Live. Deno runtime/npm exacto, StorageACL real, claim global legado e CI final continuam pendentes. A aprovação desta prévia não é aprovação automática das operações acima: Pedro autoriza cada aplicação/deploy/publicação/índice/provaACL.

## Pacote objetivo de autorização futura (não executado)

Janela A — prova técnica real isolada: autorizar apenas identidades/fixtures técnicas e paths exclusivos privados, Auth e storage/readback; sem fatura/TX/BP. Comparar versões runtime/npm exatas com as usadas localmente (cache offline não prova Cloud). Sem apagar candidatos e sem alterar permissões globais. Custos: chamadas Auth/storage e poucos fixtures até20MiB; montante dependente do plano, não estimado como zero.

Janela B — depois da revisão: autorizar DDL aditivo do core+attempts por migrações tracked geradas dos SQL manuais EXATOS/hashes15; bucket técnico e novas RPCs/endpoints com config autenticada. Verificar corpos/grants/RLS/contexto reais antes de permitir operação. Upload/execute #333 continuam false; autorizar ativação apenas após aceitação independente.

Janela C — rollout coordenado dos clientes: patch14destinos e config da função candidata, deploys explicitamente autorizados dos endpoints (ingestão existente + função nova + data-entry), frontend publicado só por autorização própria. Compatibilidade vem antes do índice. Versão v1 aceita assinatura antiga semID mas rotula legacy_untracked; v2 adapters de owner usam reserva antes de efeitos. Inventário dos clientes externos e corte versionado precisam ser acordados, nunca negar silenciosamente os clientes antigos. Reconciliação dos anteriores apenas read-only/privada, sem backfill/merge/delete.

Janela D — após política forte e conflitos agregados revistos: índice CONCURRENTLY exato fora de transação por via de schema autorizada que suporte isso. Falha/índice inválido: parar, catálogo e autorização específica DROP CONCURRENTLY só do candidato; preservar índice canónico. Rollback compatibilidade por patch inverso revisto, escritores contidos; nunca apagar auditoria/candidatos/dados. Se DDL aplicada e rollout falhar, manter tabelas/RPCs técnicas fechadas e writers/ativação suspensos; não DROP destrutivo automático.

Decisões indispensáveis: IVA≤total no legado (recomendado aceitar guarda candidata; alternativa revisão sem execução dos casos ambíguos); cliente antigo semID (recomendado rollout versionado/reconciliação, alternativa manter sem cobertura explicitamente); intenção adicional idêntica (recomendado revisão persistente explícita, alternativa referência estável). Delegação não é necessária para este pacote: permanece fora, mesmo owner apenas. Envelopes diferentes não provam intenção diferente; nenhuma garantia global por PDF/principal/operação.
