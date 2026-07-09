import { useState } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FileDown } from "lucide-react";
import { OperationalReportDialog } from "@/components/operacao/reports/OperationalReportDialog";
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  ArrowUpDown,
  BarChart3,
  Receipt,
  Users,
  FileCheck,
  BookOpen,
  LogOut,
  Ticket,
  Landmark,
  KeyRound,
  RefreshCw,
  Settings,
  Store,
  HelpCircle,
  ReceiptText,
  ShoppingBag,
  ClipboardCheck,
  Grid3x3,
  Cloud,
  Activity,
  Radar,
  ListChecks,
  Bell,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { useCoalaSyncBadge } from "@/hooks/useCoalaSyncBadge";
import { useHasFeature } from "@/hooks/useCompanyFeatures";
import { FEATURES } from "@/lib/features";
import { useIsFieldStaffOnly } from "@/hooks/useIsFieldStaffOnly";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isManager, user, signOut, hasPermission } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const activeOpEventId = searchParams.get("event");

  const coalaBadgeCount = useCoalaSyncBadge(isAdmin);
  const hasCoala = useHasFeature(FEATURES.SYNC_COALA);
  const hasFever = useHasFeature(FEATURES.SYNC_FEVER);
  const hasHealth = useHasFeature(FEATURES.SYNC_HEALTH);
  const fieldStaffOnly = useIsFieldStaffOnly();
  const inOperacao = location.pathname.startsWith("/operacao");

  const operacaoItems: Array<
    { to: string; icon: any; label: string; show: boolean } | { divider: true; key: string }
  > = [
    { to: "/operacao/dashboard",      icon: LayoutDashboard, label: "Dashboard",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/zonas",          icon: Grid3x3,         label: "Zonas / Serviços",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/etapas",         icon: ListChecks,      label: "Etapas",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/chamados",       icon: Bell,            label: "Chamados",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/equipa",         icon: Users,           label: "Equipa",
      show: hasPermission("view_operacao") || isAdmin },
    { divider: true, key: "personal" },
    { to: "/operacao",                icon: Calendar,        label: "Eventos",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/minhas-tarefas", icon: ClipboardCheck,  label: "Minhas Tarefas",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/meus-chamados",  icon: Phone,           label: "Meus Chamados",
      show: hasPermission("view_operacao") || isAdmin },
    { to: "/operacao/atividade",      icon: Activity,        label: "Atividade",
      show: hasPermission("view_operacao") || isAdmin },
  ];


  const fullNavItems = [
    { to: "/erp", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/calendario", icon: CalendarDays, label: "Calendário", show: hasPermission("manage_calendar") || isAdmin },
    { to: "/eventos", icon: Calendar, label: "Eventos", show: hasPermission("manage_events") || hasPermission("view_events") || isAdmin },
    { to: "/transacoes", icon: ArrowUpDown, label: "Transações", show: hasPermission("manage_transactions") || isAdmin },
    { to: "/bilheteiras", icon: Store, label: "Bilheteiras", show: hasPermission("manage_ticket_offices") || hasPermission("manage_accounts") || isAdmin },
    { to: "/plano-contas", icon: BookOpen, label: "Plano de Contas", show: hasPermission("manage_categories") || isAdmin },
    { to: "/contas", icon: Landmark, label: "Contas", show: hasPermission("manage_accounts") || hasPermission("view_balances") || isAdmin },
    { to: "/fornecedores", icon: Users, label: "Entidades", show: hasPermission("manage_suppliers") || isAdmin },
    { to: "/cotacoes", icon: FileCheck, label: "Cotações", show: hasPermission("manage_quotations") || isAdmin },
    { to: "/iva", icon: Receipt, label: "Gestão IVA", show: hasPermission("manage_iva") || isAdmin },
    { to: "/recorrentes", icon: RefreshCw, label: "Recorrentes", show: hasPermission("manage_recurring") || hasPermission("manage_transactions") || isAdmin },
    { to: "/reembolsos", icon: ReceiptText, label: "Reembolsos", show: hasPermission("manage_transactions") || isAdmin },
    { to: "/camarim", icon: ShoppingBag, label: "Camarim", show: hasPermission("manage_transactions") || hasPermission("camarim_team") || isAdmin },
    { to: "/cartoes", icon: CreditCard, label: "Cartões", show: hasPermission("card_manage") || isAdmin || isManager },
    { to: "/operacao", icon: Radar, label: "Operação", show: hasPermission("view_operacao") || isAdmin },
    { to: "/relatorios", icon: BarChart3, label: "Relatórios", show: hasPermission("view_reports") || isAdmin },
    { to: "/admin/auditoria-contas", icon: ClipboardCheck, label: "Auditoria Contas", show: !isAdmin && isManager },
    { to: "/admin/sync-health", icon: Activity, label: "Sync Health", show: isAdmin && hasHealth },
    { to: "/admin/sync-coala", icon: Cloud, label: "Sync Coala", show: isAdmin && hasCoala, badge: coalaBadgeCount },
    { to: "/admin/fever-sync", icon: Cloud, label: "Sync Fever", show: isAdmin && hasFever },
    { to: "/admin/ticketline-sync", icon: Cloud, label: "Sync Ticketline", show: isAdmin },
    { to: "/admin", icon: Settings, label: "Admin", show: isAdmin },
    { to: "/ajuda", icon: HelpCircle, label: "Manual", show: true },
  ];

  return (
    <aside
      className="fixed left-0 z-40 flex w-16 flex-col items-center overflow-y-auto overscroll-contain border-r border-border bg-sidebar py-4 lg:w-56 lg:overflow-hidden [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
      style={{
        top: "calc(3.5rem + env(safe-area-inset-top))",
        height: "calc(100dvh - 3.5rem - env(safe-area-inset-top))",
      }}
    >

      <nav className="flex w-full shrink-0 flex-col gap-1 px-2 pb-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-3">
        {(inOperacao ? operacaoItems : fullNavItems)
          .filter((i: any) => i.divider || (i.show && (!fieldStaffOnly || i.to.startsWith("/operacao"))))
          .map((item: any) => {
          if (item.divider) {
            return <hr key={item.key} className="my-2 border-border opacity-60" />;
          }
          const isActive =
            item.to === "/erp"
              ? location.pathname === "/erp" || location.pathname === "/"
              : item.to === "/operacao"
                ? location.pathname === "/operacao"
                : location.pathname.startsWith(item.to);
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-accent text-foreground glow-primary"
                  : "text-sidebar-foreground"
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </RouterNavLink>
          );
        })}
        {inOperacao && (
          <button
            onClick={() => setReportOpen(true)}
            disabled={!activeOpEventId}
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            title={activeOpEventId ? "Gerar Relatório PDF" : "Seleciona um evento ativo primeiro"}
          >
            <FileDown className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block flex-1 text-left">Relatório PDF</span>
          </button>
        )}
      </nav>


      <div className="mt-3 w-full shrink-0 space-y-1 px-2 lg:mt-auto lg:px-3">
        {(isAdmin || inOperacao) && (
          <button
            onClick={() => navigate("/modulos")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Trocar módulo"
          >
            <Grid3x3 className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Trocar módulo</span>
          </button>
        )}
        <div className="hidden lg:flex items-center justify-between mb-2 px-3">
          <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
        </div>
        <div className="flex justify-center lg:justify-start px-1">
          <PushNotificationToggle />
        </div>
        <RouterNavLink
          to="/perfil"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Preferências</span>
        </RouterNavLink>
        <button
          onClick={() => setShowChangePassword(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <KeyRound className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Alterar Senha</span>
        </button>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Sair</span>
        </button>
      </div>

      <ChangePasswordModal open={showChangePassword} onOpenChange={setShowChangePassword} />
      {activeOpEventId && (
        <OperationalReportDialog
          eventId={activeOpEventId}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}

    </aside>
  );
}
