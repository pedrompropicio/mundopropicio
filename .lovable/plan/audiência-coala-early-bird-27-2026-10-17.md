# Audiência Coala Early Bird 27

- Acrescentar à recolha existente a fonte `coala_list:eb2027`, usando a vista canónica, consentimento mais recente e exclusões de emails suprimidos; manter os filtros antigos.
- Permitir a chamada autenticada de serviço sem abrir acesso anónimo; manter isolamento empresarial para utilizadores.
- Acrescentar substituição completa com sessão Meta quando `filters.replace=true`, preservando adição nos restantes casos. Simulação por defeito, sem chamadas externas.
- Testar elegibilidade, filtros anteriores, substituição e simulação. Aplicar migração registada e apenas a função de sincronização.
- Entregar INSERT desativado com ligação verificada e contagem simulada; não inserir audiência, alterar cron ou publicar.

## Atenção
O cron atual não envia `dry_run=false`. Com simulação por defeito, permanecerá em simulação até alteração separadamente autorizada; nesta tarefa não será modificado.

## Detalhes técnicos
Reutilizar `crm_meta_audience_collect_leads(uuid)` e a ligação existente da conta. Testar SQL em PostgreSQL local e chamadas Meta com transporte simulado. Nenhum envio à Meta nesta execução.