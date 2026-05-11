import { LegalLayout } from "./_LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout>
      <h1>Política de Privacidade — MP Gestão Eventos / MP Audience</h1>
      <p><em>Última atualização: 11 de maio de 2026</em></p>

      <p>
        A Mundo Propício Entretenimento, Lda. ("Mundo Propício", "nós") opera a plataforma MP Gestão
        Eventos e o módulo MP Audience (<a href="https://mpgestaoeventos.com">https://mpgestaoeventos.com</a>),
        acessível apenas a utilizadores autorizados da empresa. Esta política explica que dados
        pessoais e de plataforma recolhemos, como os usamos e os direitos dos utilizadores.
      </p>

      <h2>1. Quem somos</h2>
      <p>
        Mundo Propício Entretenimento, Lda.<br />
        NIF: [a preencher]<br />
        Sede: [a preencher]<br />
        Email de contacto: pedroneto@mundopropicio.com
      </p>

      <h2>2. Dados que recolhemos</h2>

      <h3>2.1. Dados de conta (autenticação)</h3>
      <ul>
        <li>Email, nome, função na empresa</li>
        <li>Logs de acesso (data, hora, IP)</li>
        <li>Preferências de utilização</li>
      </ul>

      <h3>2.2. Dados conectados via Meta Marketing API</h3>
      <p>Com a autorização explícita do utilizador (OAuth), acedemos a:</p>
      <ul>
        <li>Ad accounts ativas no Meta Business Manager</li>
        <li>Dados de campanhas, ad sets e anúncios (nome, status, objetivo, orçamentos)</li>
        <li>Métricas de performance (impressões, cliques, gastos, conversões, ROAS)</li>
        <li>Pixels do Meta e estatísticas de eventos</li>
        <li>Custom audiences existentes e listas de partilha</li>
        <li>Interesses Meta para fins de targeting</li>
      </ul>
      <p>Permissões Meta solicitadas:</p>
      <ul>
        <li><code>ads_read</code> — leitura de campanhas e métricas</li>
        <li><code>ads_management</code> (planeado) — criação e edição de campanhas</li>
        <li><code>business_management</code> (planeado) — gestão de assets do Business Manager</li>
        <li><code>pages_read_engagement</code> — métricas de páginas associadas</li>
        <li><code>instagram_basic</code> — informação básica de contas IG ligadas</li>
      </ul>
      <p>
        Estes dados são acedidos exclusivamente no contexto de gerir campanhas publicitárias da Mundo
        Propício e nunca são partilhados com terceiros não autorizados.
      </p>

      <h3>2.3. Dados de utilização da plataforma</h3>
      <ul>
        <li>Estratégias geradas, planos de campanha, configurações</li>
        <li>Notas, comentários internos</li>
        <li>Histórico de ações realizadas</li>
      </ul>

      <h2>3. Como usamos os dados</h2>
      <ul>
        <li>Gerar estratégias de campanha personalizadas usando IA (Google Gemini via Lovable AI Gateway)</li>
        <li>Calcular indicadores de performance, ROAS e scoring de pixels</li>
        <li>Detetar oportunidades de targeting e otimização</li>
        <li>Apresentar dashboards e relatórios aos utilizadores autorizados</li>
        <li>Manter histórico para análise comparativa entre campanhas</li>
      </ul>
      <p>Os dados Meta NUNCA são:</p>
      <ul>
        <li>Vendidos a terceiros</li>
        <li>Usados para advertising em redes não-Meta</li>
        <li>Partilhados com utilizadores fora da empresa Mundo Propício</li>
        <li>Armazenados em texto plano quando se trata de tokens (cifrados com AES-256)</li>
      </ul>

      <h2>4. Armazenamento e segurança</h2>
      <ul>
        <li>Base de dados: Supabase (PostgreSQL gerido), hospedado na União Europeia</li>
        <li>Tokens de acesso Meta: cifrados em repouso com AES-256-GCM</li>
        <li>Acesso: limitado por Row-Level Security (RLS) à empresa e equipa do utilizador</li>
        <li>Backups: automáticos, retidos 30 dias</li>
        <li>Logs de auditoria: todas as ações sensíveis ficam registadas</li>
      </ul>

      <h2>5. Retenção</h2>
      <ul>
        <li>Dados de conta: enquanto a conta estiver ativa</li>
        <li>Dados Meta sincronizados: até 24 meses após última sincronização</li>
        <li>Logs de acesso: 12 meses</li>
        <li>Após eliminação da conta: 30 dias de período de "soft delete", depois eliminação permanente</li>
      </ul>

      <h2>6. Direitos do utilizador (RGPD)</h2>
      <p>Tens o direito de:</p>
      <ul>
        <li>Aceder aos teus dados pessoais</li>
        <li>Corrigir dados incorretos</li>
        <li>Solicitar eliminação ("direito ao esquecimento")</li>
        <li>Solicitar portabilidade</li>
        <li>Revogar consentimento de acesso Meta (em /audience/connections → Desconectar)</li>
        <li>Apresentar reclamação à CNPD (Comissão Nacional de Proteção de Dados de Portugal)</li>
      </ul>
      <p>Para exercer qualquer destes direitos: pedroneto@mundopropicio.com</p>

      <h2>7. Cookies e tracking</h2>
      <p>
        A plataforma usa apenas cookies essenciais (autenticação). Não usamos cookies de tracking de
        terceiros nem analytics externos.
      </p>

      <h2>8. Acesso por menores</h2>
      <p>
        A plataforma destina-se exclusivamente a uso profissional por adultos. Não recolhemos
        intencionalmente dados de menores de 18 anos.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Mudanças significativas a esta política serão comunicadas com 30 dias de antecedência por
        email aos utilizadores ativos.
      </p>

      <h2>10. Contacto</h2>
      <ul>
        <li>Email: pedroneto@mundopropicio.com</li>
        <li>Assunto: "[Privacidade] {`{teu assunto}`}"</li>
      </ul>

      <hr />

      <h1>Privacy Policy — MP Gestão Eventos / MP Audience</h1>
      <p><em>Last updated: May 11, 2026</em></p>

      <p>
        Mundo Propício Entretenimento, Lda. ("Mundo Propício", "we") operates the MP Gestão Eventos
        platform and the MP Audience module (<a href="https://mpgestaoeventos.com">https://mpgestaoeventos.com</a>),
        accessible only to authorized company users. This policy explains what personal and platform
        data we collect, how we use it, and user rights.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Mundo Propício Entretenimento, Lda.<br />
        Tax ID: [to be filled]<br />
        Registered office: [to be filled]<br />
        Contact email: pedroneto@mundopropicio.com
      </p>

      <h2>2. Data we collect</h2>

      <h3>2.1. Account data (authentication)</h3>
      <ul>
        <li>Email, name, role within the company</li>
        <li>Access logs (date, time, IP)</li>
        <li>Usage preferences</li>
      </ul>

      <h3>2.2. Data connected via the Meta Marketing API</h3>
      <p>With the user's explicit OAuth authorization, we access:</p>
      <ul>
        <li>Active ad accounts in Meta Business Manager</li>
        <li>Campaign, ad set and ad data (name, status, objective, budgets)</li>
        <li>Performance metrics (impressions, clicks, spend, conversions, ROAS)</li>
        <li>Meta Pixels and event statistics</li>
        <li>Existing custom audiences and sharing lists</li>
        <li>Meta interests for targeting purposes</li>
      </ul>
      <p>Meta permissions requested:</p>
      <ul>
        <li><code>ads_read</code> — read campaigns and metrics</li>
        <li><code>ads_management</code> (planned) — create and edit campaigns</li>
        <li><code>business_management</code> (planned) — manage Business Manager assets</li>
        <li><code>pages_read_engagement</code> — metrics for associated pages</li>
        <li><code>instagram_basic</code> — basic info of linked IG accounts</li>
      </ul>
      <p>
        This data is accessed exclusively in the context of managing Mundo Propício's advertising
        campaigns and is never shared with unauthorized third parties.
      </p>

      <h3>2.3. Platform usage data</h3>
      <ul>
        <li>Generated strategies, campaign plans, configurations</li>
        <li>Notes, internal comments</li>
        <li>History of actions performed</li>
      </ul>

      <h2>3. How we use the data</h2>
      <ul>
        <li>Generate personalized campaign strategies using AI (Google Gemini via Lovable AI Gateway)</li>
        <li>Calculate performance indicators, ROAS and pixel scoring</li>
        <li>Detect targeting and optimization opportunities</li>
        <li>Present dashboards and reports to authorized users</li>
        <li>Maintain history for comparative analysis between campaigns</li>
      </ul>
      <p>Meta data is NEVER:</p>
      <ul>
        <li>Sold to third parties</li>
        <li>Used for advertising on non-Meta networks</li>
        <li>Shared with users outside Mundo Propício</li>
        <li>Stored as plain text when it concerns tokens (encrypted with AES-256)</li>
      </ul>

      <h2>4. Storage and security</h2>
      <ul>
        <li>Database: Supabase (managed PostgreSQL), hosted in the European Union</li>
        <li>Meta access tokens: encrypted at rest with AES-256-GCM</li>
        <li>Access: limited by Row-Level Security (RLS) to the user's company and team</li>
        <li>Backups: automatic, retained for 30 days</li>
        <li>Audit logs: all sensitive actions are recorded</li>
      </ul>

      <h2>5. Retention</h2>
      <ul>
        <li>Account data: while the account is active</li>
        <li>Synced Meta data: up to 24 months after last sync</li>
        <li>Access logs: 12 months</li>
        <li>After account deletion: 30-day "soft delete" period, then permanent deletion</li>
      </ul>

      <h2>6. User rights (GDPR)</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion ("right to be forgotten")</li>
        <li>Request portability</li>
        <li>Revoke Meta access consent (in /audience/connections → Disconnect)</li>
        <li>Lodge a complaint with CNPD (Portuguese Data Protection Authority)</li>
      </ul>
      <p>To exercise any of these rights: pedroneto@mundopropicio.com</p>

      <h2>7. Cookies and tracking</h2>
      <p>
        The platform uses only essential cookies (authentication). We do not use third-party tracking
        cookies or external analytics.
      </p>

      <h2>8. Access by minors</h2>
      <p>
        The platform is intended exclusively for professional use by adults. We do not knowingly
        collect data from minors under 18.
      </p>

      <h2>9. Changes</h2>
      <p>
        Significant changes to this policy will be communicated to active users by email at least
        30 days in advance.
      </p>

      <h2>10. Contact</h2>
      <ul>
        <li>Email: pedroneto@mundopropicio.com</li>
        <li>Subject: "[Privacy] {`{your subject}`}"</li>
      </ul>
    </LegalLayout>
  );
}
