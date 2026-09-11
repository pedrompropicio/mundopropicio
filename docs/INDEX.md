# INDEX — porta de entrada única

> Se estás a começar uma sessão (humano ou Claude), **lê só este ficheiro e o `estado/` da frente em causa**. Mais nada.

## Onde vive cada tipo de informação

| Camada | Onde | Responde a | Vive ou morre |
|---|---|---|---|
| **Estado** | `docs/estado/estado-<frente>.md` | *Onde estamos?* | **Vivo** — reescrito por cima, nunca datado |
| **Pendências** | GitHub Issues | *O que falta fazer?* | **Vivo** |
| **Como funciona** | `.lovable/memory/features/*.md` | *Como é que X funciona?* | Vivo, por feature |
| **Porquê** | `docs/DECISIONS.md` (ADR) | *Porque decidimos assim?* | Vivo, append-only |
| **Arquitetura** | `docs/ARCHITECTURE.md` | *Como está montado?* | Vivo |
| **Restrições** | `.lovable/memory/constraints/*.md` | *O que nunca se pode fazer?* | Vivo |
| **Histórico** | `docs/handoffs/` | *O que aconteceu no dia X?* | **Morto** — arquivo, não se consulta para saber o estado |

**Prioridade e trabalho em curso são coisas diferentes.** A prioridade vive na label da Issue (`P0`/`P1`/`P2`); o *estar em curso* vive na secção "A trabalhar agora" do `estado-<frente>.md`. Não existem labels de estado.


**Regra de ouro:** informação com data no nome é arquivo. Informação sem data no nome é estado. Nunca se lê arquivo para saber onde estamos.

## As 9 frentes

| Frente | Ficheiro | Chat com o mesmo nome |
|---|---|---|
| Fecho & Sócios | `estado/estado-fecho-e-socios.md` | `fecho-e-socios` |
| BP, Verbas & Rateio | `estado/estado-bp-verbas-e-rateio.md` | `bp-verbas-e-rateio` |
| Vínculo BP↔Transações | `estado/estado-vinculo-bp-transacoes.md` | `vinculo-bp-transacoes` |
| Ticketing & Receita | `estado/estado-ticketing-e-receita.md` | `ticketing-e-receita` |
| Audience — Meta | `estado/estado-audience-meta.md` | `audience-meta` |
| Audience — Google | `estado/estado-audience-google.md` | `audience-google` |
| CRM, Portal & Leads | `estado/estado-crm-portal-e-leads.md` | `crm-portal-e-leads` |
| Plataforma & Infra | `estado/estado-plataforma-e-infra.md` | `plataforma-e-infra` |
| Financeiro & Tesouraria | `estado/estado-financeiro-e-tesouraria.md` | `financeiro-e-tesouraria` |

**Um chat por frente. O nome do chat é o nome da frente.** Se um tema muda de frente a meio, muda-se de chat — não se continua no errado.

## Procedimentos

| Procedimento | Ficheiro |
|---|---|
| Fecho de evento | `procedimentos/PROC-fecho-evento.md` |
| Revisão semanal | `procedimentos/PROC-revisao-semanal.md` |
| Captação de vendas Onebox (H&K Madrid) | `procedimentos/PROC-vendas-onebox-madrid.md` |
| Rateio de day-offs de turnê | `procedimentos/PROC-rateio-dayoffs-turne.md` |

## Ritual de arranque (obrigatório, por esta ordem)

1. Ler `docs/INDEX.md` (este ficheiro).
2. Ler `docs/estado/estado-<frente>.md` da frente em causa.
3. Ler as Issues abertas (`{"action":"list"}` na edge function `github-issues`). As labels reais são `P0`/`P1`/`P2` + módulo (`MP-ERP`, `MP-AUDIENCE`, `MP-CRM`, `transversal`). Não existem labels de estado — a lista do que está em curso é a secção "A trabalhar agora" do `estado-<frente>.md`.
4. Só então agir. **Nunca diagnosticar antes de ler.**

Se o tema toca num fluxo já implementado, procurar primeiro em `.lovable/memory/features/`. A hipótese por defeito é que **já existe**.

## Ritual de fecho (obrigatório)

1. Atualizar o `estado-<frente>.md` — reescrever, não acrescentar.
2. Issues: abrir as novas, fechar as resolvidas, comentar as decisões.
3. Decisão de arquitetura → entrada em `docs/DECISIONS.md`.
4. Só se a sessão for longa e densa: handoff em `docs/handoffs/` (arquivo).

## Identificadores fixos

- Lovable ERP `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f` · Portal/CRM `26b95793-17b6-478c-a6e8-745c0cfb7ed9`
- Supabase Live `sfohvvlqccmmebvjgibx` · Repo `pedrompropicio/mundopropicio`
- Company MP `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`
- Edge function de Issues: `github-issues` — parâmetro é **`number`**, não `issue_number`. PAT expira **24/set/2026**.

## Regra de base de dados que nunca se salta

**Toda a função `SECURITY DEFINER` nova no schema `public` leva, na mesma migração que a cria:**

```sql
REVOKE EXECUTE ON FUNCTION public.<nome>(<assinatura>) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<nome>(<assinatura>) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.<nome>(<assinatura>) TO service_role;  -- e só quem precisa
```

O schema `public` é exposto pelo PostgREST: sem isto a função é chamável por RPC por qualquer visitante anónimo com a chave pública do bundle.

**Duas armadilhas.** (1) `REVOKE ... FROM anon, authenticated` **não fecha nada** enquanto existir o grant de `PUBLIC` — eles herdam dele. (2) Neste projeto acontece o inverso: os grants são nominais a `anon`/`authenticated` e o `REVOKE ... FROM PUBLIC` é no-op. Por isso fazem-se **os dois** e confirma-se sempre com `has_function_privilege('anon', …)` e `has_function_privilege('authenticated', …)` — ambos `false`, `service_role` `true`. Nunca pela ACL em bruto.

**Excepção:** funções usadas dentro de políticas de RLS não se revogam (ver D-ERP37).
