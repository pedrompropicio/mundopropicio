import { useNavigate } from "react-router-dom";
import { Users, Database, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

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
];

export default function AdminPanel() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">Administração <HelpTooltip text={helpTexts.adminPanel} /></h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerir utilizadores, backups e segurança do sistema
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminCards.map((card) => (
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
