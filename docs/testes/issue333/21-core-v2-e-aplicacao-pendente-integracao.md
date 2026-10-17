# #333 — CORE v2 validado; estrutura Live pendente da integração #329

17/10/2026 UTC · executor único 0 · Cowork (ChatGPT) via Lovable ERP. Issue aberta, reserva mantida; #323 intacta.

## Gate e correção local
- Base recebida e GitHub coincidentes: ba663feba4f4dc95ed81a83ac31fef550b4f4d1c; parent f0196e77 ancestral; checkout inicial limpo; CI quality da base completed/success.
- Origem exclusivamente CORE PREPARED 9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef. BASE 4eeff2df não usado na construção v2 nem aplicado.
- Novo CORE v2 congelado: `patches/issue333/core.PENDENTE.sql`, SHA256 b60f9360599f3204ce64c0eebd46350c73f07051ae3365e1dc043c14a3c1248e.
- `preparation_validated DEFAULT false` independente de `execute_validated DEFAULT false`. Sem linhas de configuração. Settings e helper SECDEF de preparação sem privilégios PUBLIC/anon/authenticated/service_role.
- Criação de sessão, note, add_document e prepare exigem preparação validada; as três últimas verificam após lock da sessão. Recuperação de sessão existente e result_check continuam somente leitura do owner canónico. Commit mantém o gate de execução independente.
- Grants técnicos agora explícitos após cada tabela; configurações sem grants externos; RPCs públicas sem grants de service_role. Identidade forte preservada, nenhum helper global alterado.
- ATTEMPTS sem alteração: d4c8029637361010c24d48801a0176181e7e5684706f3123436da0a04822b2e0.
- Patch inerte SHA eac7fe0daa345324cd757fb776f00fb1fb3ae1ced0c84dc6734d09d8aac1c51c; manifesto SHA 93f5723e60006d1bd9fd983eae1766fec447370cb563c92c0e2434414aae530e. Gerador passa a consumir PREPARED, não reconstruir a partir do BASE destrutivo.

## Prova local exata
PostgreSQL real descartável, pgcrypto, duas ligações, ambiente sem credenciais e fetch proibido: 73/73 (67 regressões anteriores + 6 novos casos). Nenhum skip novo nem guarda relaxada.

Novos casos: preparação ausente e false, quatro RPCs 42501/zero escritas; owner lê existente/check sem escrever; preparation=true+execute=false permite preparação mas nunca commit; execute=true não ativa preparation=false; client/service sem privilégios de flags/helper; noAuth recusado; fecho da preparação durante espera de lock recusa note sem efeito.

Reprodução guardada:
```text
python3 docs/testes/issue333/run-integrated.py --base ba663feba4f4dc95ed81a83ac31fef550b4f4d1c --pg-only
apply 0
pg 0
Test Files 2 passed (2)
Tests 73 passed (73)
EXIT 0
```
O SQL carregado na cópia e os 14 destinos PREPARED conferem SHA do manifesto. Os 14 destinos ativos BASE continuam byte a byte intactos. UI/handler/typecheck/bateria geral não repetidos: nenhuma fonte ativa alterada; build automático observado OK. Outputs integrais privados em `claude-outputs/20261017-issue333-v2-pg*.md`.

## Preflight Live somente leitura
- Nenhum objeto técnico #333 nem bucket data-entry-staging existente.
- Dependências canónicas, digest e colunas do destino presentes.
- Registry oficial Drizzle confirmado em `drizzle.__drizzle_migrations`; ferramenta oficial disponível: `lov_database--migration`, escreve SQL verbatim e regista/aplica. Não foi invocada; nenhum ID novo a alegar. Não preencher história manualmente nem usar DDL por query.
- 152 políticas de storage inventariadas, todas com bucket explícito; nenhum acesso permissivo genérico sem filtro por bucket. Inventário privado guardado para avaliação final imediatamente antes de criar o bucket.
- Baselines financeiros e helpers canónicos antes/depois idênticos; inventários de contas banidas e objetos da prova17 inalterados. Dados, IDs de clientes e valores não publicados aqui.

## Bloqueio factual ANTES do DDL
Autocommits próprios locais observados: 0a78395e6433a0b9c6910faab66e052833b72b30 e 80e6130880514f193fc58e0d4941308069047e5e, descendentes da base. Nas verificações repetidas até20:54 UTC, GitHub main continuou em ba663feba4f4dc95ed81a83ac31fef550b4f4d1c. Não houve heads exclusivos de outro escritor; é integração pendente dos autocommits próprios. Pela regra #329, Fase2 não começa sem integração/receção confirmada. Nenhum push/merge/reset/rebase/force ou alternância de executor efetuado.

## Estado aplicado × pendente
APLICADO LIVE: nada nesta tarefa. Zero migrações, zero bucket, zero flags, zero escrita financeira, zero deploy/Publish.
PENDENTE: duas migrações exatas CORE v2 → ATTEMPTS, bucket privado20MiB sem grants/policies browser, certificação de schema/ACL/registry/corpos/gates negativos e baselines após aplicação. Sem prova Auth real ou simulação negativa Live nesta etapa porque os objetos ainda não existem. MIME específico não suportado pelo esquema atual da ferramenta de bucket; não alegar configuração que não foi feita.

## Retoma já autorizada
Após integração #329 e CI: revalidar heads/ausência/dependências/baselines, enviar CORE v2 e ATTEMPTS congelados byte a byte à ferramenta oficial, comparar arquivo de migração/registry/hash, criar bucket pelo Storage oficial e certificar com gates sem linhas. Não requer nova escolha técnica de Pedro. Falha parcial: parar e documentar aplicado versus pendente, sem rollback destrutivo.
Deploy/UI/índice global/ativação continuam fora desta tarefa; autorização própria futura. Nenhuma questão financeira nova nem aceitação de bypass em aberto.