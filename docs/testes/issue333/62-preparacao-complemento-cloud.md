# Prova62 — preparação do complemento único Cloud (fase8 PARCIAL, SEM execução)

Data: 2026-10-18 ~16:40 UTC. HEAD confirmado igual Lovable/GitHub main:
826b177ccac42b99f7aab6f692d3736834d2fdb5. Escopo: preparação e preflight
apenas. Zero contas, logins, sessões, allowlist, faturas, DML/DDL Cloud,
deploy ou Publish nesta entrega. Fixture59 permanece banida/revogada;
artefactos e PDF preservados; nunca reutilizada.

## 1. Novo marcador exclusivo

- fixture_marker: `issue333-pilot8-11af044ae28127538fe8cc06be67541a`
- email: `<marker>@fixture.invalid`; invoice_number: `FICTICIO-<marker>`
- PDF: o MESMO exato validado (1517 bytes, SHA256
  8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f,
  application/pdf) — fatura fictícia EUR0/IVA0.
- Marcador guardado em /tmp (0600), nunca em evidência com credenciais.

## 2. Parametrização do driver (hardcodes antigos removidos)

- `private-cloud57.ts`: MARKER57 deixou de ser constante fixa — novo
  `resolveMarker57()` lê `PILOT8_MARKER` do ambiente, valida
  `^issue333-pilot8-[a-f0-9]{32}$` e RECUSA o marcador retirado do
  fixture59. `exactPdf57` deriva sha256/size dos bytes reais do PDF e a
  referência do marcador. `AuthAdmin57.create` grava `fixture_marker` do
  marcador resolvido.
- `run-cloud57.ts`: tamanho do PDF parametrizado (`artifact.size`) nas 3
  comparações (notify, readiness, download).
- Relay: id exato + fingerprint sha256(query) + expectedKeys (prova60/61),
  inalterado.
- Verificação local: tsc --strict TSC-OK; 20/20 testes PASS com um marcador
  novo gerado (future-runner, proof60, private-cloud57, worker60).

## 3. Preflight real por SELECT oficial (só leitura, sem segredos)

- marker=0, reference=0 (identidade e referência novas ausentes — OK)
- core=0, attempt=0 (flags globais fechadas — OK)
- allowlist=2 → as 2 linhas REVOGADAS do piloto59 (prova preservada)
- MD5 das 5 funções canónicas: todos iguais aos esperados
  (current_company_id f857f027…, log_table_change 9509fe10…,
  set_company_id_on_insert 949120b4…, auth.uid() cdef18c6…,
  data_entry_pilot8_gate 1e066a6d…)

### Desvio encontrado e corrigido no SQL do complemento

A guarda `NOT EXISTS(SELECT 1 FROM data_entry_pilot8_allowlist)` da ativação
original recusaria a execução por causa das 2 linhas revogadas do piloto59.
No `pilot8-complement/activation.INERTE.sql` a guarda passa a
`... WHERE enabled` — a semântica "allowlist VAZIA sempre" (zero permissões
ATIVAS) mantém-se; as linhas revogadas são prova e nunca são apagadas.
Diff documentado no cabeçalho do ficheiro. Original em pilot8/ intacto.

## 4. SQL exato e transacional (INERTE, placeholder UUID)

- `pilot8-complement/activation.INERTE.sql`: mesma estrutura aprovada —
  validação de parâmetros/janela (≤10 min), guardas MD5 de origem e triggers,
  advisory lock, FOR UPDATE em auth.users/profiles/user_roles, identidade
  fresca (sem login, sem sessões, sem faturas, sem resultados), canonical
  company via current_company_id() com claims locais temporários, UPDATE
  role user→manager com auditoria real exata (ROW_COUNT=1, 1 linha de audit),
  INSERT das exatas 2 permissões (preparation, assistant_create) com
  expiração de 10 minutos e reviewed_note com marcador+SHA256, guarda final
  de flags fechadas/sessões. Placeholders: owner_id, role_id, created_at,
  window_start, window_end — o controller renderiza após revisar a
  identidade real criada pelo AuthAdmin.
- `pilot8-complement/revoke.INERTE.sql`: UPDATE enabled=false das exatas 2
  linhas (owner+company+operações+reviewed_note com marcador+SHA256);
  ROW_COUNT!=2 aborta. Nunca DELETE.

## 5. Etapas da execução única (quando autorizada)

1. Executor: `PILOT8_MARKER=<marker>` + driver; preflight read-only
   (markerAbsent, referenceAbsent, sourcesExact, globalsClosed) — falha ⇒
   PARAR antes de criar conta.
2. AuthAdmin cria UMA identidade (email_confirm=true, sem envio, senha
   aleatória só em memória/tmp0600, user_metadata com fixture_marker,
   company_id, full_name, pilot_pdf_*).
3. PAUSA: controller descobre a identidade por SELECT pelo marcador,
   revisa, renderiza e aplica activation.INERTE.sql (role user→manager +
   2 permissões, janela 10 min).
4. Runner aguarda readiness (≤5 min): role manager, 2 permissões ativas,
   sem sessões, flags globais fechadas.
5. Chromium real: sessão única, upload do PDF exato, prévia vinculativa
   EUR0/IVA0, autorização com nome do utilizador autenticado, DUAS execuções
   da MESMA prévia (par HTTP persistido em browser.json ANTES dos guards —
   prova61), download com SHA256 igual.
6. Confirmação por SELECT: exatamente 1 fatura EUR0/IVA0 com a referência
   FICTICIO-<marker>, zero efeitos financeiros (baseline antes/depois igual).
7. PAUSA: controller aplica revoke.INERTE.sql (exatas 2 permissões).
8. Check autenticado do próprio lote: HTTP 200 / 'conferido', SEM escritas
   (contrato de leitura da prova61 — revogação não proíbe leitura).
9. Finally independente: logout global, ban SÓ da conta criada, sessões=0
   confirmadas por SELECT independente; falha de logout não suprime ban nem
   a prova de sessões (prova61).
10. Evidência sanitizada (sem tokens/credenciais) + manifesto final.

## 6. Lacunas / checkpoint humano

- Nenhum piloto executado; aguarda mensagem posterior com identidade e
  manifestações revisadas.
- Se uma ferramenta exigir checkpoint humano (ex.: criação AuthAdmin), a
  ação exata será apresentada antes de prosseguir.
- Fases 1–7 concluídas (inalteradas), fase8 PARCIAL, 9–18 pendentes.
