import { useNavigate } from "react-router-dom";
import { Building2, TrendingUp, Users, LogOut, Radar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import { cn } from "@/lib/utils";

interface ModuleCard {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string;
  icon: typeof Building2;
  to?: string;
  enabled: boolean;
  comingSoon?: boolean;
  noAccess?: boolean;
  accent: {
    border: string;
    bg: string;
    icon: string;
    title: string;
    glow: string;
  };
}

export default function ModuleSelector() {
  const navigate = useNavigate();
  const { user, role, signOut, hasPermission, isAdmin } = useAuth();
  const { displayName } = useCompanyBranding();

  const fullName =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email?.split("@")[0] ||
    "";
  const firstName = fullName.split(" ")[0] || fullName;

  const canAudience =
    role === "admin" ||
    (role as any) === "platform_admin" ||
    (role as any) === "marketing_manager";

  const cards: ModuleCard[] = [
    {
      key: "erp",
      title: "MP Gestão",
      subtitle: "ERP",
      description: "Eventos, finanças, bilheteiras e operações",
      bullets: "Calendário · Transações · Plano de Contas · Reembolsos",
      icon: Building2,
      to: "/erp",
      enabled: true,
      accent: {
        border: "border-primary/30 hover:border-primary/60",
        bg: "bg-primary/5",
        icon: "text-primary",
        title: "text-foreground",
        glow: "hover:shadow-[0_0_40px_-10px_hsl(var(--primary)/0.5)]",
      },
    },
    {
      key: "audience",
      title: "MP Audience",
      subtitle: "Marketing & Performance",
      description: "Dashboard de campanhas Meta, ROAS, atribuição",
      bullets: "Meta Ads · Insights diários · ROAS por evento",
      icon: TrendingUp,
      to: "/audience/dashboard",
      enabled: canAudience,
      noAccess: !canAudience,
      accent: {
        border: "border-cyan-500/30 hover:border-cyan-500/60",
        bg: "bg-cyan-500/5",
        icon: "text-cyan-400",
        title: "text-foreground",
        glow: "hover:shadow-[0_0_40px_-10px_rgb(34_211_238_/_0.5)]",
      },
    },
    {
      key: "operacao",
      title: "MP Operação",
      subtitle: "Produção & Operação",
      description: "Diário de obra, frentes, registos e chamados em tempo real",
      bullets: "Frentes · Etapas · Registos · Chamados",
      icon: Radar,
      to: "/operacao/zonas",
      enabled: isAdmin || hasPermission("view_operacao"),
      noAccess: !(isAdmin || hasPermission("view_operacao")),
      accent: {
        border: "border-violet-500/30 hover:border-violet-500/60",
        bg: "bg-violet-500/5",
        icon: "text-violet-400",
        title: "text-foreground",
        glow: "hover:shadow-[0_0_40px_-10px_rgb(139_92_246_/_0.5)]",
      },
    },
    {
      key: "crm",
      title: "MP CRM",
      subtitle: "Vendas & Relacionamento",
      description: "Leads, pipelines, fidelização",
      bullets: "Em desenvolvimento",
      icon: Users,
      enabled: false,
      comingSoon: true,
      accent: {
        border: "border-border",
        bg: "bg-muted/20",
        icon: "text-muted-foreground",
        title: "text-muted-foreground",
        glow: "",
      },
    },
  ];

  const handleClick = (card: ModuleCard) => {
    if (!card.enabled || !card.to) return;
    navigate(card.to);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 h-16 border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="text-xs text-muted-foreground truncate">
          Contexto: {displayName}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            Olá, {firstName}
          </span>
          <button
            onClick={signOut}
            title="Sair"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-6xl">
          <div className="text-center">
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
              Bem-vindo{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Escolha o módulo que pretende acessar
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {cards.map((card) => {
              const Icon = card.icon;
              const clickable = card.enabled;
              return (
                <div
                  key={card.key}
                  onClick={() => handleClick(card)}
                  className={cn(
                    "relative rounded-xl border p-6 transition-all duration-200",
                    card.accent.border,
                    card.accent.bg,
                    clickable
                      ? `cursor-pointer hover:scale-[1.02] ${card.accent.glow}`
                      : "cursor-not-allowed opacity-60",
                  )}
                >
                  {card.comingSoon && (
                    <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      Em breve
                    </span>
                  )}
                  {card.noAccess && (
                    <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      Sem acesso
                    </span>
                  )}

                  <div
                    className={cn(
                      "h-12 w-12 rounded-lg flex items-center justify-center mb-4",
                      card.accent.bg,
                    )}
                  >
                    <Icon className={cn("h-7 w-7", card.accent.icon)} />
                  </div>

                  <h2 className={cn("text-xl font-bold", card.accent.title)}>
                    {card.title}
                  </h2>
                  <p className={cn("text-xs uppercase tracking-wider mt-0.5", card.accent.icon)}>
                    {card.subtitle}
                  </p>
                  <p className="text-sm text-muted-foreground mt-3">
                    {card.description}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-4 leading-relaxed">
                    {card.bullets}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Mundo Propício · MP Gestão Eventos
      </footer>
    </div>
  );
}
