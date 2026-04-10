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

const allReportItems = [
  { to: "/relatorios/dre", icon: BarChart3, label: "DRE", permission: "view_report_dre", managementOnly: true },
  { to: "/relatorios/dre-brasil", icon: Globe, label: "DRE Brasil", permission: "view_report_dre_brasil", managementOnly: true },
  { to: "/relatorios/pl", icon: TrendingUp, label: "Business Plan", permission: "view_report_pl", managementOnly: true },
  { to: "/relatorios/fluxo-caixa", icon: ArrowLeftRight, label: "Fluxo de Caixa", permission: "view_report_cashflow" },
  { to: "/relatorios/extrato", icon: Landmark, label: "Extrato Bancário", permission: "view_report_bank_statement" },
  { to: "/relatorios/contas-pagar", icon: Receipt, label: "Contas a Pagar", permission: "view_report_contas_pagar" },
  { to: "/relatorios/listas-pagamento", icon: ClipboardList, label: "Listas de Pagamento", permission: "view_report_payment_lists" },
  { to: "/relatorios/fornecedores", icon: Users, label: "Fornecedores", permission: "view_report_suppliers" },
  { to: "/relatorios/plano-contas", icon: FolderTree, label: "Plano de Contas", permission: "view_report_categories" },
  { to: "/relatorios/movimentacoes", icon: FileSearch, label: "Movimentações", permission: "view_report_movements" },
  { to: "/relatorios/bilheteiras", icon: Ticket, label: "Auditoria Bilheteiras", permission: "view_report_ticket_audit" },
  { to: "/relatorios/cache-artista", icon: Music, label: "Cachê do Artista", permission: "view_report_artist_cache", managementOnly: true },
  { to: "/relatorios/pendencias-documentais", icon: FileWarning, label: "Pendências Documentais", permission: "view_report_document_pendencies" },
  { to: "/relatorios/exportacao-contabil", icon: FileOutput, label: "Exportação Contábil", permission: "view_report_accounting_export", managementOnly: true },
  { to: "/relatorios/despesas-socios", icon: UserCheck, label: "Despesas Sócios", permission: "view_report_partner_expenses", managementOnly: true },
  { to: "/relatorios/bp-transacoes", icon: GitCompareArrows, label: "BP x Transações", permission: "view_report_pl" },
];

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasPermission, isAdmin, isManager } = useAuth();

  const reportItems = allReportItems.filter(
    (item) => {
      if (item.managementOnly && !isAdmin && !isManager) return false;
      return isAdmin || hasPermission(item.permission);
    }
  );

  const currentReport = reportItems.find((item) => item.to === location.pathname);

  if (reportItems.length === 0) {
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
            {reportItems.map((item) => (
              <SelectItem key={item.to} value={item.to}>
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
              </SelectItem>
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
      <nav className="w-52 shrink-0 space-y-1 overflow-y-auto max-h-[calc(100vh-8rem)]">
        {reportItems.map((item) => {
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
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
