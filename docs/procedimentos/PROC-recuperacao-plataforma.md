# PROC — Recuperação da plataforma num projeto Supabase novo

Ordem real de recuperação a partir do zero. Cada passo diz de onde vem o material.
A estrutura da base não está no backup por desenho: vive nas migrações do repositório.

## Ordem de execução

**1. Criar o projeto**
Projeto Supabase novo (Lovable Cloud). Guardar o novo `project ref`, o URL e a
publishable key. Nada mais se faz aqui.

**2. Correr as migrações do repositório**
Fonte: `supabase/migrations/` no repositório (~600 ficheiros, por ordem de nome).
É isto que recria tabelas, colunas, funções, triggers, índices, políticas RLS,
enums e grants. **Não se restaura estrutura a partir do backup** — o backup só tem
dados. A lista de versões aplicadas no projeto antigo está em `infra.json`
(`migracoes`), para confirmar que não falta nenhuma.

**3. Criar buckets e políticas de storage**
Fonte: `infra.json` da corrida global — `buckets` (id, público/privado,
`file_size_limit`, `allowed_mime_types`) e `politicas_storage` (nome, permissiva,
comando, roles e expressão de cada política sobre `storage.objects` e
`storage.buckets`). Criar cada bucket com a mesma configuração e recriar as
políticas com as expressões guardadas.

**4. Repor os segredos — À MÃO**
Fonte: o gestor de palavras-passe do Pedro. O `infra.json` diz **quais** segredos
existem (`segredos_vault`: nome, descrição, data) e **nunca** os valores. Os
segredos das edge functions nem aparecem no `infra.json`, porque não são legíveis
por SQL — têm de ser reintroduzidos um a um nas definições do projeto.
Se um segredo não estiver no gestor de palavras-passe, tem de ser regenerado na
plataforma de origem (Meta, Google, Twilio, Ticketline, …).

**5. Recriar os crons**
Fonte: `infra.json` → `crons` (jobid, jobname, schedule, active, command,
nodename, database, username). Recriar com `cron.schedule` no SQL Editor do
projeto novo. Atenção: os comandos que usam a service role key do vault só
funcionam depois do passo 4. Crons **não** vêm por Publish nem por migração.

**6. Restaurar os dados**
Fonte: as pastas v4 no bucket `database-backups` (ou a cópia externa delas).
Ordem: **primeiro o global**, depois cada empresa. Cada pasta traz
`manifest.json` com as contagens por tabela; o restauro exige todas as partes e
recusa contagens diferentes do manifesto. As exclusões deliberadas aparecem no
manifesto em `excluded` (hoje: `public.ticketline_sync_runs`, #204).

**7. Recriar as contas de utilizador**
Fonte: `identities.json` — `utilizadores` (id, email, telefone, datas, estado de
confirmação, banimento, `is_sso_user`, `raw_app_meta_data`) e `identidades`
(user_id, provider, provider_id, datas).
Criar cada conta com o **mesmo id** e disparar **reposição de palavra-passe
forçada**. O backup não tem — e nunca terá — hashes de palavra-passe nem tokens
de confirmação/recuperação. Sem isso, não há forma de "colar" a palavra-passe
antiga: repõe-se, ponto.
Depois de recriar as contas, confirmar `profiles` e `user_roles` (vêm do passo 6)
e que cada utilizador ficou ligado à(s) empresa(s) certas.

**8. Refazer os OAuth**
Meta (Business/Ads), Google (Ads e Search Console) e TikTok: reautorizar cada
ligação na aplicação. Os tokens guardados no projeto antigo não são
transportados, e o `identity_data` dos fornecedores é deliberadamente omitido do
backup por poder conter tokens.

**9. Ficheiros de storage — não recuperáveis por este caminho**
Os objetos dos buckets **não são copiados** pelo backup, apenas listados (e só
7 dos 29 buckets estão no manifesto). Faturas, comprovativos, criativos e
imagens do portal não voltam por aqui. Ver #202.

## O que este procedimento ainda não garante

- **Ficheiros de storage (#202)** — nunca são copiados, só listados, e o
  manifesto cobre apenas 7 dos 29 buckets. Recuperar a base não recupera um único
  PDF de fatura.
- **Restauro não atómico (#203)** — o restauro completo apaga antes de inserir,
  sem transação nem retrocesso, e a leitura das colunas em vigor corre depois dos
  apagamentos. Uma falha a meio deixa a base num estado intermédio.
- Os backups vivem dentro do próprio projeto que protegem, com retenção de 30
  dias, e podem ser apagados por um admin. Uma perda do projeto leva as cópias
  com ele.
- O PITR da Supabase está por confirmar no dashboard.
