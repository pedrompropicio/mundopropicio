import { useState, useMemo } from "react";
import { useEventComboPasses } from "@/hooks/useEventComboPasses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Layers, Check, X, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { comboPassLotGrossRevenue, comboPassLotNetRevenue } from "@/lib/combo-pass-helpers";

interface ZoneOpt {
  id: string;
  name: string;
}

interface Props {
  eventId: string;
  versionId: string | null;
  zones: ZoneOpt[];
  eventDaysCount: number;
  canEdit: boolean;
}

interface PassFormState {
  name: string;
  applies_to_days: number;
  benefits: string;
  zoneIds: string[];
}

interface LotFormState {
  name: string;
  quantity: string;
  price: string;
  iva_rate: string;
  lot_type: string;
}

const emptyLot: LotFormState = { name: "", quantity: "", price: "", iva_rate: "6", lot_type: "regular" };

export function EventComboPassesSection({ eventId, versionId, zones, eventDaysCount, canEdit }: Props) {
  const { passes, isLoading, createPass, updatePass, deletePass, saveLot, deleteLot } = useEventComboPasses(eventId, versionId);

  const [creatingPass, setCreatingPass] = useState(false);
  const [editingPassId, setEditingPassId] = useState<string | null>(null);
  const [passForm, setPassForm] = useState<PassFormState>({ name: "", applies_to_days: 0, benefits: "", zoneIds: [] });

  const [lotPanelPassId, setLotPanelPassId] = useState<string | null>(null);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState<LotFormState>(emptyLot);

  const startCreate = () => {
    setPassForm({ name: "", applies_to_days: 0, benefits: "", zoneIds: zones.map((z) => z.id) });
    setEditingPassId(null);
    setCreatingPass(true);
  };

  const startEdit = (passId: string) => {
    const p = passes.find((x) => x.id === passId);
    if (!p) return;
    setPassForm({
      name: p.name,
      applies_to_days: p.applies_to_days || 0,
      benefits: p.benefits || "",
      zoneIds: p.zones.map((z) => z.zone_id),
    });
    setEditingPassId(passId);
    setCreatingPass(true);
  };

  const cancelPass = () => {
    setCreatingPass(false);
    setEditingPassId(null);
  };

  const submitPass = () => {
    if (!passForm.name.trim()) return;
    if (passForm.zoneIds.length === 0) return;
    if (editingPassId) {
      updatePass.mutate({
        id: editingPassId,
        name: passForm.name.trim(),
        applies_to_days: passForm.applies_to_days,
        benefits: passForm.benefits || null,
        zoneIds: passForm.zoneIds,
      }, { onSuccess: cancelPass });
    } else {
      createPass.mutate({
        name: passForm.name.trim(),
        applies_to_days: passForm.applies_to_days,
        benefits: passForm.benefits || undefined,
        zoneIds: passForm.zoneIds,
      }, { onSuccess: cancelPass });
    }
  };

  const toggleZone = (zoneId: string) => {
    setPassForm((f) => ({
      ...f,
      zoneIds: f.zoneIds.includes(zoneId) ? f.zoneIds.filter((z) => z !== zoneId) : [...f.zoneIds, zoneId],
    }));
  };

  const startEditLot = (passId: string, lot: any) => {
    setLotPanelPassId(passId);
    setEditingLotId(lot.id);
    setLotForm({
      name: lot.name,
      quantity: String(lot.quantity),
      price: String(lot.price),
      iva_rate: String(lot.iva_rate ?? 6),
      lot_type: lot.lot_type || "regular",
    });
  };

  const startAddLot = (passId: string) => {
    setLotPanelPassId(passId);
    setEditingLotId(null);
    setLotForm(emptyLot);
  };

  const submitLot = () => {
    if (!lotPanelPassId || !lotForm.name.trim()) return;
    saveLot.mutate(
      {
        id: editingLotId ?? undefined,
        combo_pass_id: lotPanelPassId,
        name: lotForm.name.trim(),
        quantity: parseInt(lotForm.quantity) || 0,
        price: parseFloat(lotForm.price) || 0,
        iva_rate: parseInt(lotForm.iva_rate) || 6,
        lot_type: lotForm.lot_type,
      },
      {
        onSuccess: () => {
          setEditingLotId(null);
          setLotForm(emptyLot);
          if (editingLotId) setLotPanelPassId(null);
        },
      },
    );
  };

  const totals = useMemo(() => {
    let gross = 0;
    let net = 0;
    let qty = 0;
    for (const p of passes) {
      for (const l of p.lots) {
        gross += comboPassLotGrossRevenue(l);
        net += comboPassLotNetRevenue(l);
        qty += Number(l.quantity || 0);
      }
    }
    return { gross, net, qty };
  }, [passes]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">A carregar Combos/Passes…</div>;
  }

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Passes / Combos</h3>
          <span className="text-xs text-muted-foreground">
            ({passes.length} {passes.length === 1 ? "produto" : "produtos"} · {totals.qty.toLocaleString()} bilhetes · {formatCurrency(totals.gross)})
          </span>
        </div>
        {canEdit && !creatingPass && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Passe
          </Button>
        )}
      </div>

      {creatingPass && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Nome do Passe</Label>
              <Input value={passForm.name} onChange={(e) => setPassForm({ ...passForm, name: e.target.value })} placeholder="Ex: Passe Geral 3 dias" />
            </div>
            <div>
              <Label className="text-xs">Dias que dá acesso (0 = todos os {eventDaysCount})</Label>
              <Input
                type="number"
                min={0}
                max={eventDaysCount}
                value={passForm.applies_to_days}
                onChange={(e) => setPassForm({ ...passForm, applies_to_days: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Zonas a que dá acesso</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {zones.map((z) => {
                const active = passForm.zoneIds.includes(z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => toggleZone(z.id)}
                    className={`text-xs px-2 py-1 rounded border ${active ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
                  >
                    {active ? "✓ " : ""}{z.name}
                  </button>
                );
              })}
            </div>
            {passForm.zoneIds.length === 0 && (
              <p className="text-xs text-destructive mt-1">Seleciona pelo menos 1 zona.</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Vantagens / Notas (opcional)</Label>
            <Textarea
              value={passForm.benefits}
              onChange={(e) => setPassForm({ ...passForm, benefits: e.target.value })}
              placeholder="Ex: Acesso ao backstage, oferta de bebida, fila prioritária…"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={cancelPass}>Cancelar</Button>
            <Button size="sm" onClick={submitPass} disabled={createPass.isPending || updatePass.isPending || !passForm.name.trim() || passForm.zoneIds.length === 0}>
              {editingPassId ? "Atualizar" : "Criar Passe"}
            </Button>
          </div>
        </div>
      )}

      {passes.length === 0 && !creatingPass && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Ainda não há Passes/Combos definidos. Cria um para vender 1 bilhete válido para vários dias do festival.
        </p>
      )}

      <div className="space-y-3">
        {passes.map((pass) => {
          const passZones = pass.zones.map((pz) => zones.find((z) => z.id === pz.zone_id)?.name).filter(Boolean) as string[];
          const passQty = pass.lots.reduce((s, l) => s + Number(l.quantity || 0), 0);
          const passGross = pass.lots.reduce((s, l) => s + comboPassLotGrossRevenue(l), 0);
          const isLotPanelOpen = lotPanelPassId === pass.id;

          return (
            <div key={pass.id} className="rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{pass.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {pass.applies_to_days === 0 ? `${eventDaysCount} dias` : `${pass.applies_to_days} dia${pass.applies_to_days === 1 ? "" : "s"}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {passZones.length} zona{passZones.length === 1 ? "" : "s"}: {passZones.join(", ")}
                    </span>
                  </div>
                  {pass.benefits && (
                    <p className="text-xs text-muted-foreground">{pass.benefits}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(pass.id)} className="rounded p-1 hover:bg-secondary" title="Editar passe">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => deletePass.mutate(pass.id)} className="rounded p-1 hover:bg-destructive/20" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                )}
              </div>

              {/* Lotes */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Lotes do passe ({pass.lots.length})</span>
                  <span>{passQty.toLocaleString()} bilhetes · {formatCurrency(passGross)}</span>
                </div>
                {pass.lots.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem lotes ainda.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left">Lote</th><th className="text-right">Qtd</th><th className="text-right">Preço</th><th className="text-right">IVA</th><th className="text-right">Subtotal</th><th></th></tr>
                    </thead>
                    <tbody>
                      {pass.lots.map((lot) => (
                        <tr key={lot.id} className="group">
                          <td className="py-1"><span className="text-muted-foreground mr-1">{lot.lot_number}º</span>{lot.name}</td>
                          <td className="py-1 text-right font-mono">{lot.quantity.toLocaleString()}</td>
                          <td className="py-1 text-right font-mono">{formatCurrency(Number(lot.price))}</td>
                          <td className="py-1 text-right font-mono">{lot.iva_rate}%</td>
                          <td className="py-1 text-right font-mono font-semibold text-success">{formatCurrency(comboPassLotGrossRevenue(lot))}</td>
                          <td className="py-1 text-right">
                            {canEdit && (
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                                <button onClick={() => startEditLot(pass.id, lot)} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                                <button onClick={() => deleteLot.mutate(lot.id)} className="rounded p-1 hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-destructive" /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {isLotPanelOpen ? (
                  <div className="rounded border border-primary/30 bg-primary/5 p-2 mt-2 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <input className={inputClass} placeholder="Nome do lote" value={lotForm.name} onChange={(e) => setLotForm({ ...lotForm, name: e.target.value })} />
                      <input type="number" min="0" className={inputClass} placeholder="Qtd" value={lotForm.quantity} onChange={(e) => setLotForm({ ...lotForm, quantity: e.target.value })} />
                      <input type="number" step="0.01" min="0" className={inputClass} placeholder="Preço" value={lotForm.price} onChange={(e) => setLotForm({ ...lotForm, price: e.target.value })} />
                      <select className={inputClass} value={lotForm.iva_rate} onChange={(e) => setLotForm({ ...lotForm, iva_rate: e.target.value })}>
                        <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
                      </select>
                      <select className={inputClass} value={lotForm.lot_type} onChange={(e) => setLotForm({ ...lotForm, lot_type: e.target.value })}>
                        <option value="regular">Regular</option><option value="promo">Promo</option><option value="special">Especial</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setLotPanelPassId(null); setEditingLotId(null); setLotForm(emptyLot); }} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      <button onClick={submitLot} disabled={saveLot.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25"><Check className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ) : (
                  canEdit && (
                    <button onClick={() => startAddLot(pass.id)} className="text-xs text-primary hover:underline mt-1">
                      + Adicionar lote
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
