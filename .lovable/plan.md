# Correção mínima da corrida tosl_guard

- Preservar a definição canónica de confirmação e todas as regras existentes.
- Preparar SQL INERTE que bloqueia os pais antigo/novo em ordem UUID e revalida o estado após obter os locks; confirmar usa o mesmo lock do pai.
- Provar localmente INSERT/UPDATE/DELETE/movimento concorrentes, confirmação com linha pendente, permissões existentes e rollback, com duas conexões PostgreSQL e definições canónicas.
- Entregar definição anterior, comparação, hashes completos, aplicação guardada contra drift, rollback/readback e documentação; libertar só reserva333.

## Limites
Nenhuma aplicação Cloud, alteração de writers financeiros reservados, deploy, Publish, modelo/Gmail ou ativação. Pacote A não se repete.

## Detalhes técnicos
CREATE OR REPLACE apenas de public.tosl_guard(), preservando owner/ACL/SECDEF/search_path. Confirm_ticket_office_statement permanece byte-identical. O pacote aborta perante drift da definição/trigger; testes usam base descartável, nunca dados Cloud.