# PROC — Análise de consentimento antes de construir ou publicar um site

**Decisão do Pedro, 26/10/2026** (nº D-ERP a atribuir no fecho da #359). **Regra:** nenhum site, portal, landing page ou formulário — novo ou alterado — que recolha dados pessoais ou use cookies/pixels vai para produção sem esta análise feita, registada na Issue e aprovada pelo Pedro. Dúvida é bloqueio. Classe de risco: o Publish é R2.

**Porquê.** O portal do Coala foi construído sem prova de consentimento: o sistema só guardava sim/não. Em 26/10/2026, nos 2.316 cadastros da lista Early Bird (Coala), nenhum tinha versão do texto nem data do aceite; o formulário do topo enviava consentimento de e-mail fixo, sem caixa; e só 135 tinham prova do consentimento de cookies. Corrigido na #359. Isto não se repete.

## Quem faz
A frente dona do tema faz a análise (docs/CHATS.md); o outro lado (Claude/ChatGPT) revê por leitura. O agente Lovable executa o que a análise definir e não decide finalidades nem textos. Novo texto, nova finalidade ou novo destinatário de dados → validação do jurídico, com a confirmação escrita anexada à Issue.

## 1. Antes de construir (desenho)
- Finalidades por canal (e-mail, WhatsApp, anúncios, análise) e fundamento de cada uma.
- Texto exato de cada consentimento. Uma caixa por canal; WhatsApp sempre separado e só com telemóvel; nada pré-marcado; submeter não depende de consentimentos que a finalidade não exija.
- Banner de cookies com categorias, "Recusar Tudo" tão acessível como "Aceitar Tudo", e a categoria de marketing a nomear cada plataforma (Meta, Google, TikTok) e a dizer se e-mail/telemóvel em hash são partilhados.
- Política de privacidade com responsável, finalidades, destinatários, prazos, direitos e CNPD; data de "última atualização" correta; coerente com o banner (as mesmas plataformas).

## 2. Prova por registo (obrigatória)
- Cada cadastro guarda: versão do texto de cada consentimento dado, data/hora no servidor, idioma, e prova do consentimento de cookies (identificador da escolha no banner).
- Os textos vivem numa tabela de versões imutável (`consent_text_versions`); mudar um texto cria uma versão nova, nunca se edita a existente.
- Falta de prova nunca rejeita o cadastro: regista-se sem a prova.
- Dados reconstruídos a partir do histórico levam marca de origem (`histórico do site`); nunca se apresentam como registados na hora.

## 3. Antes do Publish (verificado por query/screenshot, não por relatório do agente)
- Textos no ecrã = versão gravada; idioma PT/EN correto.
- Pixel/GTM só carregam depois de aceite o marketing; recusar apaga cookies e pára envios.
- Cadastro de teste (marcado, depois removido) aparece na vista `lead_capture_consent_resumo` com versão, data, idioma e cookies.
- Política de privacidade publicada e coerente com o banner.
- Linha "pronto para Publish" no QUADRO só com este checklist verde; o Publish é pelo 0 · Cowork, com um "Sim" do Pedro.

## 4. Antes de qualquer envio ou público de anúncios
Consultar a vista de consentimento: e-mail só a quem tem consentimento de e-mail; WhatsApp só a quem o deu; públicos de anúncios só com cookies de marketing aceites (prova registada, ou inferida e assinalada como tal). Contactos de outras origens (importações, compradores) não herdam o consentimento da lista.

## Registo
A análise vai numa Issue (módulo + P0/P1/P2, classe R2 no Publish) com este checklist preenchido. Decisões efetivas vão para `docs/DECISIONS.md` no fecho. Ver Issue #359 e `.lovable/memory/constraints/consentimento-antes-de-publicar-site.md`.
