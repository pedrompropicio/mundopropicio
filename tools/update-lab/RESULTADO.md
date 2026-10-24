# Resultado do laboratório

Data: 24/10/2026. Etapa isolada autorizada pelo Pedro. Sem merge ou publicação do ERP.

## Executado localmente

- Cinco ficheiros da revisão de origem conferidos entre GitHub e leitura do projeto, com conteúdo igual e fingerprints em `sources.json`.
- 11 testes de lógica/servidor aprovados, zero falhas/skip: execução dos módulos reais com adaptadores explícitos.
- O modo atual solicita navegação após nova versão mesmo quando o formulário fictício está marcado como alterado. A mesma condição foi reproduzida no sinal simulado de mudança de controller.
- O modo experimental espera uma ação explícita e revalida alterações pendentes, gravação e modal no clique; guardar por si só não pede navegação.
- O servidor recusa Origin estrangeiro, rotas desconhecidas e métodos de escrita fora do único endpoint de simulação local.

## Navegador

O ambiente local contém Playwright, mas nenhum Chromium instalado. A tentativa de instalar o navegador devolveu arquivo inválido e terminou com erro. O comando de navegador falhou por ausência do executável: não é prova de defeito do ERP nem um teste aprovado.

Os cenários de browser foram preparados para execução no workflow isolado desta branch. Resultado remoto ainda por conferir neste ponto do histórico. Não há alegação de aprovação visual, iOS, Safari, Workbox real ou suite completa do ERP.

## Limites

O mecanismo de recarregamento foi comprovado por execução da lógica; a perda de conteúdo através de navegação real depende dos cenários de navegador. A proposta é experimental e só existe em tools/update-lab/. Não resolve ainda #351 em produção nem cria a homologação integral da #352.

Não foram alterados main, src/, vite.config.ts ou funções/BD em produção. Nenhuma sessão real, credencial, consulta Live, email, campanha, pagamento ou cron foi utilizado.
