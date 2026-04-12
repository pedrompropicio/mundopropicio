import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, Pencil, Save, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  implementation: any;
  event: any;
  allEvents: any[];
}

export function ImplBPTab({ implementation, event, allEvents }: Props) {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>(event?.id || "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  // Fetch forecasts for the selected event
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["impl-forecasts", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*, account_categories:category_id(id, name, code)")
        .eq("event_id", selectedEventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  // Fetch categories for the selector
  const { data: categories = [] } = useQuery({
    queryKey: ["impl-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const leafCategories = categories.filter(
    (c) => !categories.some((other) => other.parent_id === c.id)
  );

  const updateForecast = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("event_forecasts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-forecasts", selectedEventId] });
      toast.success("Previsão atualizada");
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteForecast = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_forecasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-forecasts", selectedEventId] });
      toast.success("Previsão removida");
    },
  });

  const startEdit = (forecast: any) => {
    setEditingId(forecast.id);
    setEditValues({
      description: forecast.description,
      specification: forecast.specification || "",
      amount: forecast.amount,
      iva_rate: forecast.iva_rate,
      category_id: forecast.category_id || "",
      status: forecast.status,
      type: forecast.type,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateForecast.mutate({
      id: editingId,
      updates: {
        description: editValues.description,
        specification: editValues.specification || null,
        amount: Number(editValues.amount),
        iva_rate: Number(editValues.iva_rate),
        category_id: editValues.category_id || null,
        status: editValues.status,
        type: editValues.type,
      },
    });
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

  const totalExpense = forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const totalIncome = forecasts.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      {/* Event selector for multi-event */}
      {allEvents.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Evento:</span>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allEvents.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.parent_event_id ? "↳ " : "🎤 "}{e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-6 text-sm">
        <span>{forecasts.length} linhas</span>
        <span className="text-green-600 dark:text-green-400">Receitas: {fmtMoney(totalIncome)}</span>
        <span className="text-red-600 dark:text-red-400">Despesas: {fmtMoney(totalExpense)}</span>
        <span className="font-semibold">Resultado: {fmtMoney(totalIncome - totalExpense)}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Especificação</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor Base</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : forecasts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhuma previsão encontrada para este evento
                    </TableCell>
                  </TableRow>
                ) : (
                  forecasts.map((f: any, idx: number) => {
                    const isEditing = editingId === f.id;
                    const cat = f.account_categories;
                    return (
                      <TableRow key={f.id} className={isEditing ? "bg-primary/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.type} onValueChange={(v) => setEditValues({ ...editValues, type: v })}>
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="expense">Despesa</SelectItem>
                                <SelectItem value="income">Receita</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={f.type === "expense" ? "destructive" : "default"} className="text-xs">
                              {f.type === "expense" ? "Despesa" : "Receita"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs"
                              value={editValues.description}
                              onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                            />
                          ) : (
                            <span className="text-sm">{f.description}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs"
                              value={editValues.specification}
                              onChange={(e) => setEditValues({ ...editValues, specification: e.target.value })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{f.specification || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.category_id} onValueChange={(v) => setEditValues({ ...editValues, category_id: v })}>
                              <SelectTrigger className="h-7 w-48 text-xs">
                                <SelectValue placeholder="Sem categoria" />
                              </SelectTrigger>
                              <SelectContent>
                                {leafCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.code} {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">
                              {cat ? `${cat.code} ${cat.name}` : (
                                <span className="text-amber-500 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Sem categoria
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 text-xs text-right w-24"
                              value={editValues.amount}
                              onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })}
                            />
                          ) : (
                            <span className="text-sm font-mono">{fmtMoney(Number(f.amount))}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Select value={String(editValues.iva_rate)} onValueChange={(v) => setEditValues({ ...editValues, iva_rate: Number(v) })}>
                              <SelectTrigger className="h-7 w-16 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="6">6%</SelectItem>
                                <SelectItem value="13">13%</SelectItem>
                                <SelectItem value="23">23%</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{f.iva_rate}%</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editValues.status} onValueChange={(v) => setEditValues({ ...editValues, status: v })}>
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Rascunho</SelectItem>
                                <SelectItem value="approved">Aprovado</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {f.status === "draft" ? "Rascunho" : f.status === "approved" ? "Aprovado" : f.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                                  <Save className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(f)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                                  if (confirm("Remover esta previsão?")) deleteForecast.mutate(f.id);
                                }}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
