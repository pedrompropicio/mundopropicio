import { useNavigate } from "react-router-dom";
import { Users, Database, ShieldAlert, ShieldCheck, Trash2, History, Activity, ClipboardCheck, Sparkles, Building2, Bell, Cloud, Link2, Banknote } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useCompany } from "@/hooks/useCompany";
import SystemRemindersBanner from "@/components/SystemRemindersBanner";

const adminCards = [
  {
    to: "/admin/utilizadores",
    icon: Users,
    title: "Utilizadores",
    description: "Gerir contas, perfis e permissões de utilizadores",
  },
  {
    to: "/admin/backups",
    icon: Database,
    title: "Backups",
    description: "Visualizar e gerir backups da base de dados",
  },
  {
    to: "/admin/seguranca",
    icon: ShieldAlert,
    title: "Segurança",
    description: "Painel de segurança, auditoria e monitorização",
  },
  {
    to: "/admin/lixeira",
    icon: Trash2,
    title: "Lixeira",
    description: "Recuperar itens eliminados nos últimos 30 dias",
  },
  {
    to: "/admin/implantacao",
    icon: History,
    title: "Implantação",
    description: "Importar e reconciliar dados de eventos passados",
  },
  {
    to: "/admin/atividade",
    icon: Activity,
    title: "Atividade",
    description: "Tempo de utilização e secções mais usadas por utilizador",
  },
  {
    to: "/admin/auditoria-contas",
    icon: ClipboardCheck,
    title: "Auditoria Contas",
    description: "Análise IA de classificações no BP/Transações e gestão da numeração do Plano de Contas",
  },
  {
    to: "/admin/reconciliacao-bp-tx",
    icon: Link2,
    title: "Reconciliação BP ↔ TX",
    description: "Resolver transações ambíguas, L2-only ou fora do BP, escrevendo a ligação direta às linhas do BP",
  },
  {
    to: "/admin/formalidade",
    icon: Sparkles,
    title: "Auditoria Formalidade",
    description: "Analisa todos os BPs ativos e sugere o estado de formalidade com base nas transações reais",
  },
  {
    to: "/admin/lembretes",
    icon: Bell,
    title: "Lembretes",
    description: "Lembretes automáticos da plataforma — banner no admin + WhatsApp diário via Twilio",
  },
  {
    to: "/admin/auditoria-rls",
    icon: ShieldCheck,
    title: "Auditoria RLS Legacy",
    description: "Verificação diária automática de policies RLS antigas (auth.uid() IS NOT NULL); histórico e execução manual",
  },
  {
    to: "/admin/sync-coala",
    icon: Cloud,
    title: "Sync Coala (Drive)",
    description: "Sincronização automática diária da planilha Coala no Google Drive com o BP do evento",
  },
  {
    to: "/admin/iban-duplicados",
    icon: Banknote,
    title: "IBANs Duplicados",
    description: "Auditoria retroativa: IBANs partilhados por mais de um fornecedor na empresa ativa",
  },
];


export default function AdminPanel() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useCompany();

  const cards = [
    ...adminCards,
    ...(isPlatformAdmin
      ? [{
          to: "/admin/empresas",
          icon: Building2,
          title: "Empresas",
          description: "Gestão multi-empresa — criar empresas-cliente e convidar admins (super-admin)",
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <SystemRemindersBanner />
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">Administração <HelpTooltip text={helpTexts.adminPanel} /></h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerir utilizadores, backups e segurança do sistema
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.to}
            className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/10"
            onClick={() => navigate(card.to)}
          >
            <CardHeader className="flex flex-row items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
