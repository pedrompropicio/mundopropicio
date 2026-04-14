import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  Landmark,
  Receipt,
  ClipboardList,
  Users,
  FolderTree,
  ArrowLeftRight,
  FileSearch,
  Globe,
  Ticket,
  Music,
  FileWarning,
  FileOutput,
  UserCheck,
  GitCompareArrows,
  Timer,
  PieChart,
  Wallet,
  Activity,
  BarChart2,
  LineChart,
  Target,
  Handshake,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  permission: string;
  managementOnly?: boolean;
}

interface ReportGroup {
  label: string;
  emoji: string;
  items: ReportItem[];
}

const allReportGroups: ReportGroup[] = [
  {
    label: "Estratégicos",
    emoji: "📊",
    items: [
      { to: "/relatorios/dre", icon: BarChart3, label: "DRE", permission: "view_report_dre", managementOnly: true },
      { to: "/relatorios/dre-empresarial", icon: Landmark, label: "DRE Empresarial", permission: "view_report_dre", managementOnly: true },
      { to: "/relatorios/dre-brasil", icon: Globe, label: "DRE Brasil", permission: "view_report_dre_brasil", managementOnly: true },
      { to: "/relatorios/pl", icon: TrendingUp, label: "Business Plan", permission: "view_report_pl", managementOnly: true },
      { to: "/relatorios/rentabilidade", icon: Target, label: "Rentabilidade Artista/Venue", permission: "view_report_dre", managementOnly: true },
      { to: "/relatorios/evolucao-mensal", icon: LineChart, label: "Evolução Mensal", permission: "view_report_dre", managementOnly: true },
      { to: "/relatorios/desvio-orcamental", icon: GitCompareArrows, label: "Desvio Orçamental", permission: "view_report_pl", managementOnly: true },
    ],
  },
  {
    label: "Financeiros",
    emoji: "💰",
    items: [
      { to: "/relatorios/fluxo-caixa", icon: ArrowLeftRight, label: "Fluxo de Caixa", permission: "view_report_cashflow" },
      { to: "/relatorios/extrato", icon: Landmark, label: "Extrato Bancário", permission: "view_report_bank_statement" },
      { to: "/relatorios/contas-pagar", icon: Receipt, label: "Contas a Pagar", permission: "view_report_contas_pagar" },
      { to: "/relatorios/exposicao-financeira", icon: Receipt, label: "Exposição Financeira", permission: "view_report_contas_pagar" },
      { to: "/relatorios/aging", icon: Timer, label: "Aging Contas a Pagar", permission: "view_report_contas_pagar" },
      { to: "/relatorios/concentracao-fornecedores", icon: PieChart, label: "Concentração Fornecedores", permission: "view_report_suppliers" },
      { to: "/relatorios/projecao-tesouraria", icon: Wallet, label: "Projeção de Tesouraria", permission: "view_report_cashflow", managementOnly: true },
    ],
  },
  {
    label: "Vendas & Bilheteira",
    emoji: "🎫",
    items: [
      { to: "/relatorios/bilheteiras", icon: Ticket, label: "Auditoria Bilheteiras", permission: "view_report_ticket_audit" },
      { to: "/relatorios/taxa-ocupacao", icon: BarChart2, label: "Taxa de Ocupação", permission: "view_report_ticket_audit" },
      { to: "/relatorios/curva-vendas", icon: Activity, label: "Curva de Vendas", permission: "view_report_ticket_audit" },
      { to: "/relatorios/comparativo-vendas", icon: LineChart, label: "Comparativo Vendas", permission: "view_report_ticket_audit" },
      { to: "/relatorios/mix-receitas", icon: PieChart, label: "Mix Receitas por Canal", permission: "view_report_ticket_audit" },
    ],
  },
  {
    label: "Parcerias",
    emoji: "🤝",
    items: [
      { to: "/relatorios/despesas-socios", icon: UserCheck, label: "Despesas Sócios", permission: "view_report_partner_expenses", managementOnly: true },
      { to: "/relatorios/acerto-socios", icon: Handshake, label: "Resumo Acerto Sócios", permission: "view_report_partner_expenses", managementOnly: true },
    ],
  },
  {
    label: "Operacionais",
    emoji: "📋",
    items: [
      { to: "/relatorios/bp-transacoes", icon: GitCompareArrows, label: "BP x Transações", permission: "view_report_pl" },
      { to: "/relatorios/movimentacoes", icon: FileSearch, label: "Movimentações", permission: "view_report_movements" },
      { to: "/relatorios/fornecedores", icon: Users, label: "Fornecedores", permission: "view_report_suppliers" },
      { to: "/relatorios/plano-contas", icon: FolderTree, label: "Plano de Contas", permission: "view_report_categories" },
      { to: "/relatorios/listas-pagamento", icon: ClipboardList, label: "Listas de Pagamento", permission: "view_report_payment_lists" },
      { to: "/relatorios/cache-artista", icon: Music, label: "Cachê do Artista", permission: "view_report_artist_cache", managementOnly: true },
      { to: "/relatorios/pendencias-documentais", icon: FileWarning, label: "Pendências Documentais", permission: "view_report_document_pendencies" },
      { to: "/relatorios/exportacao-contabil", icon: FileOutput, label: "Exportação Contábil", permission: "view_report_accounting_export", managementOnly: true },
      { to: "/relatorios/indice-pendencias", icon: AlertTriangle, label: "Índice de Pendências", permission: "view_report_document_pendencies" },
    ],
  },
];

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasPermission, isAdmin, isManager } = useAuth();

  const filteredGroups = allReportGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.managementOnly && !isAdmin && !isManager) return false;
      return isAdmin || hasPermission(item.permission);
    }),
  })).filter((group) => group.items.length > 0);

  const allItems = filteredGroups.flatMap((g) => g.items);
  const currentReport = allItems.find((item) => item.to === location.pathname);

  if (allItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Sem acesso a relatórios.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        <Select
          value={location.pathname}
          onValueChange={(value) => navigate(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Escolha o relatório">
              {currentReport?.label ?? "Escolha o relatório"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {filteredGroups.map((group) => (
              <React.Fragment key={group.label}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.emoji} {group.label}
                </div>
                {group.items.map((item) => (
                  <SelectItem key={item.to} value={item.to}>
                    <div className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-3 overflow-y-auto max-h-[calc(100vh-8rem)]">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.emoji} {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      "hover:bg-secondary hover:text-secondary-foreground",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

// Need React import for Fragment usage
import React from "react";
