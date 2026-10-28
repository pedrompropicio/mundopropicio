# Relatório Wallet Clube Newgang (só leitura, nada alterado)

Ficheiros lidos: docs/INDEX.md (sem entrada Wallet), docs/DECISIONS.md (D-ERP275), docs/QUADRO.md (#368, níveis Crew/Goat), .lovable/memory/features/portal-newgangfestival.md, drizzle/migrations/0144_derp275_club_wallet_passes.sql, 0177_issue327_club_points_core.sql, 0263_newgang_erasure_on_request.sql, supabase/functions/newgang-portal/{index.ts, wallet-google.ts, erase-extras.ts}, src/test/newgang-wallet-google.test.ts, newgang-wallet-levels.test.ts. Nota: o índice de memória refere "Criativos Wallet Newgang", mas o ficheiro não existe em .lovable/memory/features/.

## 1. Google Wallet (Android)
- Código: módulo `newgang-portal/wallet-google.ts` + ações na edge `newgang-portal`. Não há rota própria no ERP; o botão está no portal newgangfestival.pt.
- Fluxo: o membro confirmado chama a ação `wallet_google` → `walletSave` lê nível/pontos canónicos (#327), faz upsert do objeto na Google e grava `club_wallet_passes` → devolve `https://pay.google.com/gp/v/save/<JWT RS256>`. Se faltar sessão → 401; se a Google falhar → 503 `wallet_unavailable`.
- Classe Loyalty `<issuer>.newgang_clube_2027` (ensureClass só cria, nunca reescreve; o logo vai por patchClassLogo, PATCH à parte). Objeto `<issuer>.ngclub_<member_id sem hífens>`, com QR `NG-<member_no>`, pontos, nível, crew, evento e imagem por nível.
- Ações de serviço: `wallet_sync`, `wallet_artwork_apply`, `wallet_test_url`.
- Testado: testes unitários (ids, classe, objeto sem email, PATCH só quando há mudança, mudança só de nível, JWT verificável, níveis Gang/Crew/Goat e legados). Em Live a 14/10: PATCH da classe e do objeto do membro nº 3 confirmados por GET na Google, save_url HTTP 200. A 16/10: criativos Crew/Goat ativos (flag true). NÃO testado: gravação real num telemóvel. Limitação: `hexBackgroundColor` é ignorado no LoyaltyObject.

## 2. Apple Wallet
Não existe: nem pkpass, nem assinatura, nem web service de atualização, nem APNs. Só o CHECK `platform IN ('google','apple')` na tabela.

## 3. Base de dados
- `club_wallet_passes`: escrita só pela edge (service_role) em walletSave/walletSync; o apagamento é feito pela RPC `club_member_erase` (0263). Leitura: authenticated, isolada por empresa através da policy RESTRICTIVE; anon não tem policy, logo fica bloqueado. Live hoje: **0 linhas**.
- `club_wallet_due(p_limit)`: SECURITY DEFINER, redefinida na 0177 (nível com piso). Devolve os passes com pontos/nível diferentes do último envio. Sem EXECUTE para anon nem authenticated; chamada só por `walletSync`.
- Cron `newgang-wallet-sync` (*/10, ativo) → POST `newgang-portal` `wallet_sync`. Os erros ficam em `last_error` e nunca mexem nos pontos.

## 4. Segredos
- Google: GOOGLE_WALLET_SA_KEY e GOOGLE_WALLET_ISSUER_ID, ambos definidos.
- Apple: o código não espera nenhum segredo. Não há nenhum definido.

## 5. Ciclo de vida
- Pontos/nível: o cron compara com last_points/last_level e faz PATCH do objeto completo (incluindo hero).
- erase_account (#368): só no apagamento real, antes da RPC, faz PATCH `state=EXPIRED`, porque a Google não permite apagar. A resposta traz `extras.wallet` ok/none/failed (dry_run → none). Depois, a RPC apaga a linha do passe.

## 6. Lacunas
Android:
- Testar num telemóvel real: gravar, receber atualização de pontos e nível, ver o QR.
- Decidir a cor por nível (opções: GenericObject ou classe por nível), porque hoje não é aplicada.
- Confirmar se a conta Issuer está em produção (publicação aprovada) ou se ainda está em modo demo/teste. Não verificado.
- Hoje há 0 passes, por isso o cron nunca foi exercido com membros reais.
- Falta o texto "Tudo de Elite" no benefício Goat e a revisão da CI/visual pendente.

Apple (depois da aprovação do Developer):
- Pass Type ID e certificado (.p12), certificado WWDR e novos segredos (por ex. APPLE_PASS_CERT/KEY/PASSWORD, APPLE_TEAM_ID, APPLE_PASS_TYPE_ID).
- Gerar e assinar o .pkpass (manifest + PKCS#7) numa edge.
- Web service PassKit: register/unregister/serial/latest; tabela de dispositivos e authenticationToken.
- Push APNs (chave .p8) a partir do cron de sync, além do ramo `apple` em walletSync/erase.
- Criativos em formato Apple (icon/logo/strip).

No portal Newgang (projeto 1a915f50…): procurar o botão/chamada `wallet_google`, a deteção Android/iOS e o tratamento de 401/503.
