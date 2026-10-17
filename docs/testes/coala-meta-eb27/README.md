# Coala Early Bird 27 — audiência Meta

## Aplicado (17/10/2026)
- Migração canónica `drizzle/migrations/0180_coala_meta_eb27_audience_source.sql`.
- Fonte SQL `supabase/manual/20261017_coala_meta_eb27.sql`: equivalente à migração salvo newline final. SHA256 canónico `2a4dce1161bb69736ac9b9ab936d0d160b6fadd89db92d0dcb2e5714d8ab886e`; corpo SQL MD5 Live/local `a8e3d4fc0260625b160339c434560abc`.
- Deploy exclusivamente `crm-meta-audience-sync`, SHA256 submetido `a198cc7d37d4731d11dc132953e4fe9842acd5c6ec4d5d22147861a95b795fd7`. Não é auditoria independente do código remoto; HTTP com JWT inválido devolveu 401.
- Nenhuma audiência inserida, cron alterado, Publish, envio Meta ou alteração de consentimento/CAPI.

## Contrato
A nova fonte usa `coala_list_members`, último consentimento por empresa/email (`created_at DESC,id DESC`), fallback à última captura e false por omissão. Telefone é obtido independentemente do consentimento: captura mais recente, priorizando telefone preenchido. Retorna apenas email/phone; nome não faz parte do contrato preexistente da RPC. Supressões globais e da Coala excluem; supressões de outra empresa não excluem.

Filtros anteriores preservam o SELECT original. A correção de autorização deixa service_role sem auth.uid funcionar; utilizador continua a exigir sessão, admin/marketing_manager e empresa correta. ACL Live: anon EXECUTE false; authenticated/service_role true. Nenhuma função nova, grant anónimo ou mudança de default privileges.

Sync pagina a RPC sem teto de 1000 nem truncagem silenciosa. `filters.replace === true` seleciona usersreplace, mesma sessão, batch_seq crescente desde 1, finalização só no último batch. Falha interrompe a substituição sem retry/finalização de lote posterior; adição mantém users. Simulação por defeito devolve só contagem/modo, não amostras de emails; ocorre antes de token, logs, status ou transporte externo.

## Testes e provas
- Baseline Vitest: 158 ficheiros/1273 passaram; depois: 160 ficheiros/1281 passaram. Ambos exit0; 1 ignorado/11 todo inalterados.
- 8 testes novos: handler real transpilado, dry_run default, zero token/log/Meta, sessão replace, retirada, falha sem retry, adição e paginação2301.
- PostgreSQL17 local descartável, socket Unix sem TCP: 9 combinações de filtros comparadas à implementação antiga; consentimento true/false, supressão, fallback, ausência, prioridade telefone, revogação, service sem uid, rejeição sessão/tenant e ACL. Exit0.
- tsgo app antes/depois exit0; Deno check função inteira exit0 após usar cache temporária/nodeModulesDir auto. Primeira tentativa Deno falhou por pacote npm não resolvido, não por código.
- Build automático OK. CI baseline `788f883` success; CI intermediário `1cf1ca77` success. CI do commit final deve ser reconfirmado após sincronização.
- Outputs integrais nesta pasta, `dry-run.json`, `INSERT-pendente.sql`.

## Simulação Live sem dados pessoais
00:55:55 UTC: 1888 membros na vista, 1877 elegíveis. SELECT agregado da mesma expressão SQL, zero chamadas Meta. Não se afirma dry_run HTTP da nova audiência: não existe linha Coala, e foi deliberadamente proibido inseri-la nesta tarefa. Execução RPC com service role provada localmente; endpoint Live novo com audiência real não exercitado.

## Passo pendente de autorização
INSERT pronto em `INSERT-pendente.sql`, enabled=false, ligação de conta verificada por SELECT. Não executado. O cron atual omite dry_run, portanto fica em simulação com o novo default; ativar enabled isoladamente NÃO habilita envio. Precisa de autorização separada para chamada explícita dry_run=false/adequação do cron.

## Limitações e consentimento
Substituição e remoção comprovadas com transporte simulado; nenhuma chamada Meta autorizada. Meta processa audiências assincronamente; receipt não prova matching. Payload vazio é enviado como sessão única final, mas suporte Meta para esvaziar completamente não pôde ser confirmado em documentação atual: não prometer remoção real no caso zero elegíveis sem validação separada. Concorrência entre sessões replace também não foi exercitada na Meta.

Regra operacional segue D-ERP276/277, sem tocar #322. Antes de envio efetivo, conservar prova de consentimento que cubra partilha/publicidade Meta (newsletter isolada não demonstra essa finalidade), verificar restrições do dataset no Events Manager, aceitar Business Tools Terms e disponibilizar retirada pela via de consentimento/contacto. Hashing não é anonimização.