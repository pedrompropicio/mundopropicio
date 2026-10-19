# #333 — desenho86 de controlo durável (INERTE, não aplicado)

## Escolha fundamentada
Fonte local: `drizzle/migrations/0190_issue333_core_v2_closed_structure.sql:59–65`. `data_entry_settings` contém somente `execute_validated` e `preparation_validated`, singleton, sem linha de ativação, com todos os privilégios revogados incluindo service_role. Não reutilizar estes booleans como disponibilidade de AI nem abrir a ACL legada. Não existe controlo de provider comprovado por esta revisão local; presença da chave não é elegibilidade.

Proposta: uma relação pública dedicada `data_entry_analysis_control_333`, singleton por integração/workspace, não por utilizador/empresa, pois o acesso/créditos são partilhados. Um único controlo impede contornar bloqueio trocando tenant. Nenhum framework/queue novo, nenhuma escrita financeira. Esta entrega NÃO cria SQL aplicável nem liga o desenho ao código.

Contrato proposto: revision bigint crescente; state closed|ready|paused_credit|paused_policy|denied_provider|unavailable; enabled e reviewed false por defeito; fixed model/endpoint atuais; reason_code enum curto controlado; upstream_status integer; changed_at servidor; changed_by UUID público opcional; active_claim UUID opcional. Sem chave, prompt, corpo upstream, IP, documento ou metadados de pedido armazenados.

## Operações futuras (exigem revisão própria e DDL autorizado)
- Reader service-role-only, RLS/grants explícitos e nenhum acesso anon/authenticated. Ausência/erro/closed é deny. Não expor o registo diretamente ao browser.
- claim: sob lock da linha, exige ready+enabled+reviewed e nenhum active_claim, grava claim e revision; uma única chamada global em voo. É redução de concorrência, NÃO orçamento monetário.
- finish: compara claim/revision; limpa somente o claim correspondente, nunca reabre uma pausa. Revalida sessão/contexto/bytes como hoje e descarta resposta se revision/state mudou.
- provider403: persiste denied_provider antes de terminar; não retry, chave nova, modelo alternativo ou probe.403 de créditos/policy persiste pausa distinguida pelo code validado, sem guardar texto arbitrário.402 pausa cadeia inteira.404 endpoint documentado ou conta/configuração comprovada fica unavailable.
-429/5xx: nenhuma repetição automática no fluxo atual; eventual recuperação futura respeita Retry-After/backoff finito. Este desenho não adiciona timer ou tarefa de fundo.
- recusa com200 termina somente aquele pedido; não revoga acesso global. Resposta vazia não constitui sucesso. Novo trabalho apenas por nova ação humana.
- resume: ação expressa do responsável, revisão acesso restaurado e revision nova; flags da UI nunca reabrem. Não inferir restauração pela expiração de lease.
- crash/resultado incerto: claim permanece bloqueado até conferência explícita, sem timeout autorizando reenvio. Sem background atual, não há probes automáticos.

## Corridas, custos e limites honestos
Lock+claim ordena pedidos locais e bloqueios persistidos. Pedido já aceito externamente não pode ser retraído por alteração na BD; Stop propaga AbortSignal mas não garante zero faturação. Entre claim e POST, uma pausa pode impedir conclusão sem impedir cobrança já iniciada. Nunca prometer stop instantâneo global.

6000tokens é teto de saída incluindo raciocínio, não quota financeira; input5MiB não estima tokens de imagem/PDF nem preço.8turnos/12000bytes limitam conversa, não saldo. UI busy só evita cliques naquela instância; não limita outras abas/dispositivos/isolates. Nenhum bloqueio de concorrência servidor está implementado nesta entrega, pois um Map local perderia estado e daria falsa garantia global. Antes de ativar, implementar/testar o claim durável em PostgreSQL descartável, duas conexões, revogação/corridas/crash/reload e ACL. Uma quota de custo duro exige mecanismo de orçamento/contabilização autorizado independente; não prometida.

## Dependência explícita
Este documento é desenho concreto revisável, NÃO DDL aprovado/aplicado nem pausa operacional. Gates atuais false impedem qualquer chamada. Próxima implementação: migration tracked separada + testes locais credencial-free de ACL/claim/revision; aplicação e ativação requerem decisões próprias, sem liberar9 ou concluir8.