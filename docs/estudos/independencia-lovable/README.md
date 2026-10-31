# Independência do Lovable — Plano de arquitetura (31/10/2026)

Autor: 0 · Cowork (Claude). Estado: **proposta para decisão futura**. Fases e cronograma a definir. Nada aqui autoriza implementar.
Documento vivo com diagramas: https://claude.ai/artifact/KhsB9Yp5rbXjgwtRQbBvnN

## Objetivo
A operação da Mundo Propício deixa de depender do Lovable. A base, o servidor, os segredos, o alojamento e a publicação passam a ser nossos. O Lovable fica como mais um editor de código, ao lado do Codex e do Claude Code.
- **Quem manda é o processo, não a ferramenta.** GitHub como fonte única, CI verde, homologação e o Sim do Pedro para a produção.
- **Ligação à #352.** A homologação isolada em curso é a primeira peça. A segunda é a migração da produção para um Supabase próprio na UE, decidida a 29/10, com prazo a 31/01/2027.

## Como está hoje (31/10/2026)
- **Lovable, que controla a operação:**
  - projetos ERP, Portal/CRM, Newgang e Coala;
  - o agente Lovable, que é o escritor principal;
  - o Publish e os domínios, que publicam o projeto inteiro de uma vez;
  - o Supabase Live no Lovable Cloud (Ohio, EUA): base única de produção, Auth, storage, edge functions, segredos e crons. O acesso é só indireto, pelo agente ou por conector.
- **GitHub mundopropicio:** o código, sincronizado com os projetos Lovable.
- **Codex e Claude Code:** leem e preparam; escrevem por conector ou pelo GitHub.
- **Já fora do Lovable (nosso):**
  - mp-homolog-3 (Ohio), da #352, em curso;
  - repo privado com GitHub Actions: replay, sonda e aplicação.
- **Serviços reais:** Meta, Google, TikTok, bilheteiras, WhatsApp e e-mail. São chamados pelas funções e crons do Live.

## Como vai ficar (alvo)
- **Editores:** o agente Lovable, o Codex e o Claude Code escrevem todos no GitHub, com CI.
- **GitHub como fonte única:**
  - um ramo principal;
  - feature flags;
  - migrações versionadas;
  - um escritor de cada vez (#329).
- **CI:**
  - rápido em cada commit, em minutos;
  - replay pesado só quando muda o que ele exercita.
- **Ambientes:**
  - Desenvolvimento: local ou pré-visualização, dados fictícios, sem serviços reais.
  - Homologação: Supabase próprio, isolado, ensaio de cada mudança, igual à produção. Usa destinos de teste ou fica bloqueada por trava.
  - Produção: Supabase próprio na UE, frontend em alojamento próprio, domínios nossos. Só a produção fala com serviços reais.
- **Portão:** homologação → produção só com o Sim do Pedro; publica-se só o que está verde e aprovado.

## Fases (faixas iguais, fora de escala)
1. **Homologação** — em curso.
   - Esqueleto igual ao Live.
   - Isolamento provado.
   - Frontend de teste.
   - CI separado adotado.
   - Portão: homologação verde e isolada.
2. **Backend na UE** — até 31/01/2027.
   - Supabase próprio na UE: base, Auth, storage, funções, crons e segredos nossos.
   - Portão: produção na UE verificada.
3. **Frontend próprio** — data a definir.
   - Build a partir do GitHub, alojamento próprio, domínios e callbacks.
   - Publicar = CI aprovado.
   - Portão: domínios e logins a funcionar.
4. **Lovable como editor** — data a definir.
   - Um editor entre três, com as mesmas regras de CI e sem controlo da operação.
   - Rever o plano contratado.

A Fase 3 pode ser preparada em paralelo com o fim da Fase 2. O Real do Brasil e as issues menores avançam em todas as fases.

## Regras de trabalho no modelo alvo
1. **Um só ramo principal.** Lovable, Codex e Claude Code escrevem todos lá, um de cada vez (#329), com CI verde.
2. **Feature flags.** Trabalho longo, como o Real, entra desligado e liga-se por empresa ou para teste. O interruptor protege também os efeitos: cálculos, exportações, envios e crons.
3. **Base só aditiva.** Tabelas e colunas novas com valores por defeito neutros. Nada se renomeia nem se apaga enquanto o novo não estiver ligado.
4. **Migrações versionadas no repo.** Nada de DDL solto em produção.
5. **Caminho até à produção:** desenvolvimento → homologação → Sim do Pedro → produção.
6. **CI separado.** O rápido corre em cada commit; o replay pesado só corre quando muda o SQL, o transporte ou a D2.
7. **Homologação igual à produção.** Recaptura e reaplicação quando há migrações novas. A rotação diária das partições do realtime obriga a recapturar em cada dia de trabalho.

## A verificar antes de decidir, e riscos
| Ponto | O que verificar | Risco |
|---|---|---|
| Funcionalidades só do Lovable Cloud | Gateways de IA, integrações e conectores geridos | Precisam de substituto |
| Editor Lovable com Supabase externo | Ver o achado externo 2 abaixo | O Lovable deixa de servir como editor |
| Sincronização GitHub → Lovable | Piloto com uma issue pequena | Conflitos |
| Publicação de edge functions | Comportamento por confirmar | Funções desalinhadas |
| Domínios, Auth e callbacks | DNS, redirect URLs, Meta, e-mail | Logins e integrações partidos |
| Segredos e crons | Inventário completo; só o Pedro tem os valores | Serviços parados |
| Isolamento da homologação | Prova de que não chama serviços reais | Efeitos reais a partir de testes |
| Custos | Supabase próprio, alojamento e CI contra a poupança no Lovable | Custo acima do previsto |
| Rotação diária do realtime | Tratar como objeto de plataforma | Recapturas inválidas no dia seguinte |

## Experiência de quem já fez (pesquisa de 31/10/2026)
1. **Posição oficial do Lovable.** "Never locked in": o código sincronizado com o Git é nosso.
   - O frontend pode sair e manter o backend, desde que se reconfigurem variáveis, segredos e redirects.
   - O backend só migra oficialmente para Supabase (gerido ou self-hosted).
   - Auth, storage, realtime e edge functions **não** vão com a base.
   - Dados e ficheiros exportam-se à parte.
   - O editor e o agente são serviço gerido e não se auto-alojam.
   - Fonte: https://docs.lovable.dev/tips-tricks/self-hosting
2. **Supabase sobre projetos no Lovable Cloud.**
   - Não há transferência automática.
   - Um projeto com o Lovable Cloud ativo **não pode ser desligado nem trocado** para um Supabase externo.
   - Não há acesso à service role, ao SQL Editor nem a ligações diretas.
   - Implicação para a Fase 2: para o Lovable continuar a editar com a nossa base, é provável que seja preciso um projeto Lovable novo ligado ao nosso Supabase desde o início, ou editar só fora do Lovable. **A verificar antes de decidir.**
   - Fonte: https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud.md
3. **Guia passo a passo (WZ-IT).**
   - A exportação da base faz-se pela opção "Export project data" do Cloud: um ficheiro `.backup` restaurado com `pg_restore`.
   - Primeiro o inventário, depois o schema, a seguir os dados.
   - Auth: os hashes das passwords vêm na exportação, mas as sessões não.
   - Storage: os ficheiros vão à parte, com verificação.
   - Funções: os callbacks mudam de URL.
   - Segredos: são recriados e rodados.
   - Crons: são reconfigurados.
   - Cut-over com fronteira de escrita e janela de rollback.
   - Fonte: https://wz-it.com/en/knowledge/supabase/migrate-lovable-cloud-to-supabase/
4. **Caso prático (DZone).**
   - Utilizadores migrados por script, mantendo os IDs e os hashes das passwords.
   - Tabelas importadas com ordem de FKs automática.
   - App despublicada durante a migração.
   - A ligação direta pode exigir IPv4, o mesmo que vimos hoje na #352.
   - Fonte: https://dzone.com/articles/migration-from-lovable-cloud-to-supabase-1
5. **Guia empresarial (Superblocks).**
   - A governança tem de ir com a app: RLS, papéis e auditoria.
   - Rodar as chaves depois do cut-over.
   - Divergência: diz que as passwords não exportam, ao contrário das fontes 3 e 4. Confirmar no nosso caso.
   - Fonte: https://www.superblocks.com/blog/lovable-migration
6. **Frontend para Vercel com o Claude Code.** Repo comunitário com guia e script, e regresso ao Lovable possível religando o GitHub. Não cobre o backend do Lovable Cloud.
   - Fonte: https://github.com/NirDiamant/lovable-to-claude-code

## Cronograma e decisões pendentes
- **Data fechada:** produção no Supabase próprio na UE até 31/01/2027. As restantes datas definem-se depois de a homologação ficar verde.
- **Decisões do Pedro, por ordem:**
  - [ ] Aprovar o desenho como direção, sem autorizar implementação.
  - [ ] Datas da Fase 1.
  - [ ] Piloto de código fora do Lovable.
  - [ ] Adoção do CI separado, depois da revisão do 0.
  - [ ] Data da Fase 2, dentro do prazo.
  - [ ] Escolha do alojamento do frontend e data da Fase 3.
  - [ ] Momento da Fase 4 e revisão do plano contratado.
