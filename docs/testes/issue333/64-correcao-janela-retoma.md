# Prova64 — correção temporal do SQL de ativação + retoma da MESMA identidade (SEM execução Cloud)

Data: 2026-10-18 ~17:22 UTC. HEAD recebido 0853bbb39cdccb0368ddf9910fc84c7d3ce910ac.
Fase8 PARCIAL. Zero login, sessão, role, allowlist, fatura, DML/DDL Cloud, deploy ou Publish.
Fixture59 intacta (banida/revogada). Nenhuma conta nova.

## 1. Estado privado (verificado sem imprimir segredo)
- /tmp/issue333-63/state.json 0600: phase=created_checkpoint, no_login=true, owner = o revisto pelo controller, created_at exato.
- /tmp/issue333-63/secret 0600 presente (32 chars; conteúdo não lido para saída).
- PDF privado 0600: 1517 B, SHA256 8ae66f6a… igual ao do repositório.
- Lacuna: o baseline63 ficou só como queries (base.sql/meta.sql), não como resultado guardado. A retoma recolhe um baseline novo
  (2 leituras iguais, senão PARA antes do login) — é esse o "antes" da comparação financeira.
- Estado não perdido → não foi preciso banir.

## 2. Defeito e correção (activation.INERTE.sql do complemento)
Defeito: `au.created_at NOT BETWEEN window_start AND window_end` + `clock_timestamp()` na mesma janela (<=10 min) ⇒
impossível ativar após um checkpoint humano >10 min. A janela de criação era usada como prazo de ativação.

Diff (única linha de guarda alterada; comentário de proveniência acrescentado no cabeçalho):
```
- au.created_at NOT BETWEEN (p->>'window_start')::timestamptz AND (p->>'window_end')::timestamptz OR
+ au.created_at > (p->>'window_start')::timestamptz OR
```
Mantidos sem alteração: igualdade EXATA de created_at, owner/role/email/marcador/empresa/meta, email confirmado,
last_sign_in/banned NULL, 1 membership role=user, sessões 0, zero sessões/tentativas/faturas/resultados, allowlist ATIVA 0,
flags globais fechadas, MD5 das 5 fontes + triggers, lock, empresa canónica, auditoria real, janela <=10 min com relógio dentro,
permissões a expirar em 10 min. Origem da identidade: checkpoint63 + SELECT independente do controller (17:15:57 UTC).

## 3. Validação local PostgreSQL descartável
`bunx vitest run --config docs/testes/issue333/pilot8-complement/vitest64.config.ts` → 20/20 PASS
(docs/testes/issue333/pg/activation64.test.ts, mesmas migrações/fontes Live da prova56):
- aceita identidade criada 30 min antes, ativada na janela atual; 2 permissões ~600 s; linha revogada preservada não bloqueia;
- rejeita com rollback total: identidade futura, created_at trocado (1 ms), owner/role/email/meta/empresa trocados, login,
  sessão, banido, fatura/histórico existente, flags abertas (attempt e settings), outra allowlist ativa, janela expirada,
  futura, >10 min e invertida;
- verificação estática do diff mínimo (prazo de 10 min ocorre 2× como antes).

## 4. Renderização (privada, não executada)
`docs/testes/issue333/pilot8-complement/render64.py activation|revoke <params /tmp> <out /tmp> [window_start window_end]`.
Renderizados em /tmp/issue333-64/ (0600): activation com owner/role/created_at EXATOS e janela PLACEHOLDER;
revoke com a mesma identidade. O controller substitui a janela no momento da ativação (ou re-renderiza com os 2 argumentos).
IDs não publicados neste documento.

## 5. Retoma da MESMA identidade (sem createUser)
- future-runner.ts: `resumeExistingPilot` (autorização própria `PEDRO_AUTHORIZED_SINGLE_PILOT8_RESUME63`, exige secret,
  validatePdf, `preflightResume`: identidade exata única, referência ausente, fontes, flags fechadas, allowlist ativa 0,
  sessões 0, nunca autenticada). Partilha o mesmo corpo/finally do piloto (readiness 5 min, login, par execute persistido
  antes dos guards, revogação, check 200/conferido sem escritas, logout/ban/sessões 0 independentes).
- run-cloud57.ts: `--resume-identity63` lê state/secret de /tmp 0600; ban limitado à identidade revista.
- Testes: future-runner/private-cloud57/worker60 21/21 PASS (retoma sem createUser; recusa antes do login por drift);
  typecheck estrito dos drivers OK.

## 6. Comando de retoma (só após ativação pelo controller e nova autorização)
`PILOT8_MARKER=issue333-pilot8-11af044ae28127538fe8cc06be67541a bun docs/testes/issue333/pilot8/run-cloud57.ts --resume-identity63`
