import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Handshake, Pencil, PencilOff, Eye } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface PartnerAccessManagerProps {
  eventId: string;
  eventName: string;
  subEvents?: { id: string; name: string; date: string }[];
}

interface PortalLink {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  link_source: string | null;
}

export function PartnerAccessManager({ eventId, eventName, subEvents = [] }: PartnerAccessManagerProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showVerComo, setShowVerComo] = useState(false);
  const [relinkPrompt, setRelinkPrompt] = useState<{
    userId: string;
    supplierId: string;
    supplierLabel: string;
    events: string[];
  } | null>(null);

  const allEventIds = [eventId, ...subEvents.map((s) => s.id)];

  // Get partner users
  const { data: partnerUsers = [] } = useQuery({
    queryKey: ["partner_users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "partner");
      if (error) throw error;
      if (!roles?.length) return [];
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      if (pErr) throw pErr;
      return profiles ?? [];
    },
  });

  // Resolução REAL da ligação utilizador ↔ sócio (link explícito ou fallback por email).
  const { data: portalLinks = [] } = useQuery({
    queryKey: ["partner-portal-links"],
    queryFn: async (): Promise<PortalLink[]> => {
      const { data, error } = await supabase.rpc("partner_portal_links");
      if (error) throw error;
      return (data ?? []) as PortalLink[];
    },
  });

  const linkByUser = useMemo(() => {
    const m: Record<string, PortalLink> = {};
    portalLinks.forEach((l) => { m[l.profile_id] = l; });
    return m;
  }, [portalLinks]);

  // Sócios deste evento (e sub-eventos), sem duplicados.
  const { data: eventPartnerOptions = [] } = useQuery({
    queryKey: ["event-partner-suppliers", eventId, allEventIds.join(",")],
    queryFn: async (): Promise<{ value: string; label: string }[]> => {
      const { data: eps, error } = await supabase
        .from("event_partners")
        .select("supplier_id")
        .in("event_id", allEventIds);
      if (error) throw error;
      const ids = Array.from(new Set((eps ?? []).map((e: any) => e.supplier_id).filter(Boolean)));
      if (ids.length === 0) return [];
      const { data: sups, error: sErr } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("id", ids)
        .order("name", { ascending: true });
      if (sErr) throw sErr;
      return (sups ?? []).map((s: any) => ({ value: s.id, label: s.name }));
    },
  });

  // Ao escolher o utilizador, pré-selecionar o sócio a que já está ligado.
  // A ref evita que um refetch de 'partner-portal-links' volte a correr o efeito
  // e apague a escolha que o operador acabou de fazer.
  const linkByUserRef = useRef(linkByUser);
  linkByUserRef.current = linkByUser;
  useEffect(() => {
    if (!selectedUserId) return;
    setSelectedSupplierId(linkByUserRef.current[selectedUserId]?.supplier_id ?? "");
  }, [selectedUserId]);

  const existingSupplierForSelectedUser = selectedUserId ? linkByUser[selectedUserId]?.supplier_id ?? null : null;
  const changingGlobalLink =
    !!existingSupplierForSelectedUser && !!selectedSupplierId && existingSupplierForSelectedUser !== selectedSupplierId;

  // Get current access for this event and sub-events
  const { data: accessRecords = [], isLoading } = useQuery({
    queryKey: ["partner_event_access", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_event_access")
        .select("*")
        .in("event_id", allEventIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Resolve effective permissions per partner user (same precedence as AuthContext):
  // admin/platform_admin → all; else role_permissions baseline ± user_permissions overrides.
  const accessUserIds = Array.from(new Set(accessRecords.map((r: any) => r.user_id)));
  const { data: permsByUser = {} as Record<string, Set<string>> } = useQuery({
    queryKey: ["partner_access_perms", eventId, accessUserIds.sort().join(",")],
    enabled: accessUserIds.length > 0,
    queryFn: async () => {
      const RELEVANT = ["view_bp", "view_partner_transactions"] as const;
      const { data: roleRows, error: qErr1 } = await supabase
        .from("user_roles").select("user_id, role").in("user_id", accessUserIds);
      if (qErr1) throw qErr1;
      const rolesByUser: Record<string, string[]> = {};
      (roleRows ?? []).forEach((r: any) => {
        (rolesByUser[r.user_id] ||= []).push(r.role);
      });
      const allRoles = Array.from(new Set((roleRows ?? []).map((r: any) => r.role)));
      const rolePermsRes = allRoles.length
        ? await supabase.from("role_permissions").select("role, permission").in("role", allRoles as any)
        : { data: [] as any[] };
      const rolePermMap: Record<string, Set<string>> = {};
      ((rolePermsRes.data as any[]) ?? []).forEach((r: any) => {
        (rolePermMap[r.role] ||= new Set()).add(r.permission);
      });
      const { data: userPerms, error: qErr2 } = await supabase
        .from("user_permissions").select("user_id, permission, granted").in("user_id", accessUserIds);
      if (qErr2) throw qErr2;
      const out: Record<string, Set<string>> = {};
      for (const uid of accessUserIds) {
        const roles = rolesByUser[uid] || [];
        if (roles.includes("admin") || roles.includes("platform_admin")) {
          out[uid] = new Set(RELEVANT);
          continue;
        }
        const set = new Set<string>();
        for (const role of roles) (rolePermMap[role] || new Set()).forEach((p) => set.add(p));
        (userPerms ?? [])
          .filter((u: any) => u.user_id === uid)
          .forEach((u: any) => { if (u.granted) set.add(u.permission); else set.delete(u.permission); });
        out[uid] = new Set(RELEVANT.filter((p) => set.has(p)));
      }
      return out;
    },
  });

  const invalidateLinks = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-portal-links"] });
    queryClient.invalidateQueries({ queryKey: ["portal-partner-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["partner_users"] });
  };

  // Um sócio é uma empresa e pode ter N representantes: ligar uma pessoa não
  // desliga ninguém. Desligar tem caminho próprio (unset_partner_portal_user).
  const setPortalUserMutation = useMutation({
    mutationFn: async ({ supplierId, profileId }: { supplierId: string; profileId: string }) => {
      const { error } = await supabase.rpc("set_partner_portal_user", {
        _supplier_id: supplierId,
        _profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLinks();
      toast({ title: "Sócio ligado ao utilizador." });
    },
    onError: (e: any) =>
      toast({ title: "Não foi possível ligar o sócio", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const unsetPortalUserMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc("unset_partner_portal_user", { _profile_id: profileId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLinks();
      toast({ title: "Ligação ao sócio removida." });
    },
    onError: (e: any) =>
      toast({ title: "Não foi possível remover a ligação", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const supplierLabelOf = (sid: string) =>
    eventPartnerOptions.find((o) => o.value === sid)?.label ?? "sócio";

  // Religar uma pessoa a OUTRO sócio deixa os acessos antigos desalinhados: os
  // eventos onde o novo sócio não participa deixam de estar visíveis para ela.
  // Avisa-se antes de gravar; nunca se retiram acessos automaticamente — a
  // decisão é de quem está a operar.
  const requestRelink = async (userId: string, supplierId: string, currentSupplierId: string | null) => {
    if (!currentSupplierId || currentSupplierId === supplierId) {
      setPortalUserMutation.mutate({ supplierId, profileId: userId });
      return;
    }
    try {
      const [accessRes, partnerRes] = await Promise.all([
        supabase
          .from("partner_event_access")
          .select("event_id, events(id, name, parent_event_id)")
          .eq("user_id", userId)
          .eq("is_active", true),
        supabase.from("event_partners").select("event_id").eq("supplier_id", supplierId),
      ]);
      if (accessRes.error) throw accessRes.error;
      if (partnerRes.error) throw partnerRes.error;
      const partnerEventIds = new Set((partnerRes.data ?? []).map((r: any) => r.event_id));
      const losing = (accessRes.data ?? [])
        .map((a: any) => a.events)
        .filter(
          (ev: any) =>
            ev &&
            !partnerEventIds.has(ev.id) &&
            !(ev.parent_event_id && partnerEventIds.has(ev.parent_event_id)),
        )
        .map((ev: any) => String(ev.name ?? "—"));
      if (losing.length === 0) {
        setPortalUserMutation.mutate({ supplierId, profileId: userId });
        return;
      }
      setRelinkPrompt({ userId, supplierId, supplierLabel: supplierLabelOf(supplierId), events: losing });
    } catch (e: any) {
      toast({
        title: "Não foi possível verificar os acessos deste utilizador",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const addAccessMutation = useMutation({
    mutationFn: async () => {
      const idsToGrant = selectedEventIds.length > 0 ? selectedEventIds : [eventId];
      const inserts = idsToGrant.map((eid) => ({
        user_id: selectedUserId,
        event_id: eid,
        is_active: true,
      }));
      // Primeiro a ligação ao sócio (único caminho de escrita): se falhar, não
      // fica acesso órfão. A falha possível passa a ser ligação sem acesso.
      const { error: rpcErr } = await supabase.rpc("set_partner_portal_user", {
        _supplier_id: selectedSupplierId,
        _profile_id: selectedUserId,
      });
      if (rpcErr) throw rpcErr;
      const { error } = await supabase.from("partner_event_access").upsert(inserts, { onConflict: "user_id,event_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-portal-links"] });
      queryClient.invalidateQueries({ queryKey: ["partner_users"] });
      setSelectedUserId("");
      setSelectedSupplierId("");
      setSelectedEventIds([]);
      setShowAddForm(false);
      toast({ title: "Acesso concedido ao parceiro." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAccessMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("partner_event_access").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Acesso atualizado." });
    },
  });

  const toggleEditBpMutation = useMutation({
    mutationFn: async ({ id, canEdit }: { id: string; canEdit: boolean }) => {
      const { error } = await supabase.from("partner_event_access").update({ can_edit_bp: !canEdit } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Permissão de edição do BP atualizada." });
    },
  });

  const updateDefaultTabMutation = useMutation({
    mutationFn: async ({ id, defaultTab }: { id: string; defaultTab: string }) => {
      const { error } = await supabase.from("partner_event_access").update({ default_tab: defaultTab } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Aba inicial atualizada." });
    },
  });

  const removeAccessMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_event_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Acesso removido." });
    },
  });

  // Group access by user
  const accessByUser = accessRecords.reduce<Record<string, any[]>>((acc, record) => {
    if (!acc[record.user_id]) acc[record.user_id] = [];
    acc[record.user_id].push(record);
    return acc;
  }, {});

  const getEventName = (eid: string) => {
    if (eid === eventId) return eventName;
    const sub = subEvents.find((s) => s.id === eid);
    return sub ? sub.name : "—";
  };

  const getUserName = (userId: string) => {
    const user = partnerUsers.find((u: any) => u.id === userId);
    return user ? `${user.full_name || ""} (${user.email})` : userId;
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Handshake className="h-4 w-4" /> Acesso de Parceiros
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVerComo((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Ver como sócio
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Conceder Acesso
          </button>
        </div>
      </div>

      {showVerComo && (
        <div className="glass space-y-2 rounded-xl p-4">
          <label className="block text-[11px] font-medium text-muted-foreground">
            Abrir o Portal deste evento na vista de um sócio (só leitura)
          </label>
          <SearchableSelect
            options={eventPartnerOptions}
            value=""
            onValueChange={(v) => {
              if (!v) return;
              window.open(`/parceiro/evento/${eventId}?ver_como=${v}`, "_blank", "noopener");
              setShowVerComo(false);
            }}
            placeholder="Selecione o sócio..."
          />
        </div>
      )}

      {showAddForm && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Parceiro</label>
            <SearchableSelect
              options={partnerUsers.map((u: any) => ({ value: u.id, label: `${u.full_name || ""} — ${u.email}` }))}
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              placeholder="Selecione um parceiro..."
            />
            {partnerUsers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nenhum utilizador com perfil "Parceiro". Crie primeiro na gestão de utilizadores.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Sócio que representa *</label>
            <SearchableSelect
              options={eventPartnerOptions}
              value={selectedSupplierId}
              onValueChange={setSelectedSupplierId}
              placeholder="Selecione o sócio..."
            />
            {eventPartnerOptions.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Este evento não tem sócios registados. Adicione-os primeiro na aba de sócios do evento.
              </p>
            )}
            {changingGlobalLink && (
              <p className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
                Este utilizador já está ligado a outro sócio. A ligação é global: muda em todos os eventos.
              </p>
            )}
          </div>

          {subEvents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Eventos / Cidades (deixe vazio para acesso total)</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedEventIds((prev) => prev.includes(eventId) ? prev.filter((i) => i !== eventId) : [...prev, eventId])}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedEventIds.includes(eventId) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {eventName} (Geral)
                </button>
                {subEvents.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedEventIds((prev) => prev.includes(sub.id) ? prev.filter((i) => i !== sub.id) : [...prev, sub.id])}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedEventIds.includes(sub.id) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => addAccessMutation.mutate()}
              disabled={!selectedUserId || !selectedSupplierId || addAccessMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addAccessMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Conceder
            </button>
            <button
              onClick={() => { setShowAddForm(false); setSelectedUserId(""); setSelectedSupplierId(""); setSelectedEventIds([]); }}
              className="rounded-lg px-4 py-2 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {Object.keys(accessByUser).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum parceiro tem acesso a este evento.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(accessByUser).map(([userId, records]) => {
            const link = linkByUser[userId];
            const linkedSupplierId = link?.supplier_id ?? null;
            // `partner_portal_links` devolve também ligações resolvidas por
            // COINCIDÊNCIA DE EMAIL (user_supplier_id tem esse recurso). Essa
            // resolução não é uma ligação registada, por isso não se representa
            // no seletor — fica como texto. O seletor mostra só o link explícito.
            const explicitSupplierId = link?.link_source === "link" ? linkedSupplierId : null;
            return (
            <div key={userId} className="glass rounded-xl p-4">
              <p className="text-sm font-semibold mb-2">{getUserName(userId)}</p>
              {/* (g9c · P2-12) A ligação ao sócio decide se o Portal resolve a identidade. */}
              <div className="mb-3 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground block">Sócio que representa</label>
                <SearchableSelect
                  options={eventPartnerOptions}
                  value={explicitSupplierId ?? ""}
                  onValueChange={(v) => {
                    if (!v) {
                      // Desligar age sobre ESTA pessoa, não sobre o sócio.
                      if (explicitSupplierId) unsetPortalUserMutation.mutate(userId);
                      return;
                    }
                    setPortalUserMutation.mutate({ supplierId: v, profileId: userId });
                  }}
                  placeholder="Selecione o sócio..."
                />
                {!explicitSupplierId && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
                    Sem sócio ligado — o Portal não mostra fechamento. Escolha aqui o sócio, ou ligue na ficha do sócio
                    (Entidades → editar → «Representantes no Portal»).
                  </p>
                )}
                {linkedSupplierId && link?.link_source === "email" && (
                  <p className="text-[11px] text-muted-foreground">
                    O Portal resolve por coincidência de email ({link.supplier_name || "sócio"}), sem ligação registada.
                    Escolha o sócio acima para fixar a ligação a esta pessoa.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                {records.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={r.is_active ? "text-foreground" : "text-muted-foreground line-through"}>{getEventName(r.event_id)}</span>
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {r.is_active ? "Ativo" : "Bloqueado"}
                      </span>
                      {r.can_edit_bp && (
                        <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary">
                          Edita BP
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const perms = (permsByUser as Record<string, Set<string>>)[r.user_id] || new Set<string>();
                        const showBp = perms.has("view_bp");
                        const showTx = perms.has("view_partner_transactions");
                        const current = r.default_tab || "bp";
                        const accessible: Record<string, boolean> = {
                          bp: showBp, tickets: true, transactions: showTx,
                        };
                        const currentInaccessible = !accessible[current];
                        return (
                          <select
                            value={current}
                            onChange={(e) => updateDefaultTabMutation.mutate({ id: r.id, defaultTab: e.target.value })}
                            className={`text-[10px] rounded border bg-background px-1.5 py-0.5 ${currentInaccessible ? "border-amber-500 text-amber-500" : "border-input"}`}
                            title={currentInaccessible ? "Aba escolhida não está acessível com as permissões atuais do parceiro" : "Aba que abre por defeito"}
                          >
                            {showBp && <option value="bp">BP</option>}
                            <option value="tickets">Bilhetes</option>
                            {showTx && <option value="transactions">Transações</option>}
                            {currentInaccessible && (
                              <option value={current}>
                                {current === "bp" ? "BP" : current === "transactions" ? "Transações" : current} (inacessível)
                              </option>
                            )}
                          </select>
                        );
                      })()}
                      <button
                        onClick={() => toggleEditBpMutation.mutate({ id: r.id, canEdit: !!r.can_edit_bp })}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={r.can_edit_bp ? "Retirar edição do BP" : "Permitir editar BP"}
                      >
                        {r.can_edit_bp ? <Pencil className="h-4 w-4 text-primary" /> : <PencilOff className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <button
                        onClick={() => toggleAccessMutation.mutate({ id: r.id, isActive: r.is_active })}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={r.is_active ? "Bloquear acesso" : "Ativar acesso"}
                      >
                        {r.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <button
                        onClick={() => { if (window.confirm("Remover acesso?")) removeAccessMutation.mutate(r.id); }}
                        className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
