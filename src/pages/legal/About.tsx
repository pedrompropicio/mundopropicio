import { LegalLayout } from "./_LegalLayout";

export default function About() {
  return (
    <LegalLayout>
      <h1>Sobre o MP Audience</h1>

      <h2>O que é</h2>
      <p>
        MP Audience é o módulo de gestão de campanhas Meta Ads da plataforma MP Gestão Eventos, da
        empresa Mundo Propício Entretenimento. Foi desenvolvido para otimizar campanhas
        publicitárias de eventos ao vivo (concertos, festivais) em Portugal e Brasil.
      </p>

      <h2>Para quem</h2>
      <p>
        Uso exclusivo interno da equipa Mundo Propício e parceiros autorizados. Não é um produto SaaS
        público.
      </p>

      <h2>Capacidades</h2>
      <ul>
        <li><strong>Dashboard de campanhas</strong>: agregação em tempo real de performance Meta (ROAS, CPM, CPC, CPR)</li>
        <li><strong>Strategy Generator</strong>: gera planos completos de campanha em fases (Awareness → Engagement → Conversão → Final Push) baseados em metas de receita, com sugestões de targeting e scaling rules</li>
        <li><strong>AI Audience Coach</strong>: análise de targeting com Gemini 2.5 Flash</li>
        <li><strong>Pixel Health Diagnostics</strong>: 9 checks separados em "Bilheteira (site)" vs "Meta (config)"</li>
        <li><strong>Audience Insights</strong>: top performers, interest search, custom audiences</li>
      </ul>

      <h2>Como usa as permissões Meta</h2>

      <h3><code>ads_read</code> (em uso)</h3>
      <p>
        Para ler dados de campanhas, métricas, custom audiences, pixels e fazer análises agregadas.
        Sem esta permissão, a plataforma não consegue mostrar dados ao utilizador.
      </p>

      <h3><code>ads_management</code> (planeado)</h3>
      <p>
        Para automatizar criação de campanhas seguindo planos gerados por IA. Cada criação requer
        aprovação explícita do utilizador antes de submissão à Meta.
      </p>

      <h3><code>business_management</code> (planeado)</h3>
      <p>
        Para automatizar partilha de pixels e custom audiences entre ad accounts do mesmo Business
        Manager (operação manual hoje, demorada e propensa a erros).
      </p>

      <h3><code>pages_read_engagement</code></h3>
      <p>
        Para mostrar métricas de engagement das páginas Facebook/Instagram da Mundo Propício
        associadas à conta.
      </p>

      <h3><code>instagram_basic</code></h3>
      <p>
        Para apresentar informação básica de contas Instagram conectadas (nome, ID, foto).
      </p>

      <h2>Tecnologia</h2>
      <ul>
        <li>Frontend: React + TypeScript + Tailwind + shadcn/ui</li>
        <li>Backend: Supabase (PostgreSQL + Edge Functions + Auth + RLS)</li>
        <li>IA: Google Gemini 2.5 Flash via Lovable AI Gateway</li>
        <li>Hospedagem: Lovable Cloud (EU region)</li>
      </ul>

      <h2>Segurança</h2>
      <ul>
        <li>Tokens Meta cifrados AES-256-GCM em repouso</li>
        <li>Row-Level Security por empresa</li>
        <li>HTTPS obrigatório</li>
        <li>Auditoria de acessos</li>
      </ul>

      <h2>Contacto</h2>
      <ul>
        <li>Email: pedroneto@mundopropicio.com</li>
        <li>Website: <a href="https://mpgestaoeventos.com">https://mpgestaoeventos.com</a></li>
      </ul>

      <hr />

      <h1>About MP Audience</h1>

      <h2>What it is</h2>
      <p>
        MP Audience is the Meta Ads campaign management module of the MP Gestão Eventos platform,
        owned by Mundo Propício Entretenimento. It was built to optimize advertising campaigns for
        live events (concerts, festivals) in Portugal and Brazil.
      </p>

      <h2>Who it's for</h2>
      <p>
        Exclusive internal use by the Mundo Propício team and authorized partners. It is not a public
        SaaS product.
      </p>

      <h2>Capabilities</h2>
      <ul>
        <li><strong>Campaign dashboard</strong>: real-time aggregation of Meta performance (ROAS, CPM, CPC, CPR)</li>
        <li><strong>Strategy Generator</strong>: full phased campaign plans (Awareness → Engagement → Conversion → Final Push) based on revenue goals, with targeting suggestions and scaling rules</li>
        <li><strong>AI Audience Coach</strong>: targeting analysis with Gemini 2.5 Flash</li>
        <li><strong>Pixel Health Diagnostics</strong>: 9 checks split between "Ticketing (site)" and "Meta (config)"</li>
        <li><strong>Audience Insights</strong>: top performers, interest search, custom audiences</li>
      </ul>

      <h2>How it uses Meta permissions</h2>

      <h3><code>ads_read</code> (in use)</h3>
      <p>
        To read campaign data, metrics, custom audiences, pixels and produce aggregated analyses.
        Without this permission the platform cannot show data to the user.
      </p>

      <h3><code>ads_management</code> (planned)</h3>
      <p>
        To automate campaign creation following AI-generated plans. Every creation requires explicit
        user approval before submission to Meta.
      </p>

      <h3><code>business_management</code> (planned)</h3>
      <p>
        To automate sharing of pixels and custom audiences across ad accounts of the same Business
        Manager (today a manual, slow and error-prone task).
      </p>

      <h3><code>pages_read_engagement</code></h3>
      <p>
        To display engagement metrics of Mundo Propício's Facebook/Instagram pages associated with
        the account.
      </p>

      <h3><code>instagram_basic</code></h3>
      <p>To display basic info of connected Instagram accounts (name, ID, picture).</p>

      <h2>Technology</h2>
      <ul>
        <li>Frontend: React + TypeScript + Tailwind + shadcn/ui</li>
        <li>Backend: Supabase (PostgreSQL + Edge Functions + Auth + RLS)</li>
        <li>AI: Google Gemini 2.5 Flash via Lovable AI Gateway</li>
        <li>Hosting: Lovable Cloud (EU region)</li>
      </ul>

      <h2>Security</h2>
      <ul>
        <li>Meta tokens encrypted AES-256-GCM at rest</li>
        <li>Row-Level Security per company</li>
        <li>HTTPS enforced</li>
        <li>Access auditing</li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>Email: pedroneto@mundopropicio.com</li>
        <li>Website: <a href="https://mpgestaoeventos.com">https://mpgestaoeventos.com</a></li>
      </ul>
    </LegalLayout>
  );
}
