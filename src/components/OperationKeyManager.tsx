import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  OPERATION_KEY_EXAMPLE,
  isValidOperationKey,
  normalizeOperationKeyInput,
  operationKeyRejectionReason,
} from "@/lib/operation-key";

/**
 * Gestão ao nível da CHAVE de operação (D-ERP45) — renomear/fundir e apagar
 * grupos inteiros. Só admin. As acções são atómicas e auditadas dentro da base
 * de dados (RPCs rename_operation_key / clear_operation_key).
 *
 * Chaves geradas por código (CAMARIM-, CARTAO-) estão bloqueadas: derivam do id
 * da sessão e renomeá-las parte a ligação — o próximo fecho voltava a gerar a
 * original e ficavam dois grupos onde havia um.
 */

export const SYSTEM_KEY_PREFIXES = ["CAMARIM-", "CARTAO-"] as const;

export function isSystemOperationKey(key: string): boolean {
  return SYSTEM_KEY_PREFIXES.some((p) => key.startsWith(p));
}

interface KeyRow {
  key: string;
  count: number;
}

export function OperationKeyManager({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [renameFor, setRenameFor] = useState<KeyRow | null>(null);
  const [newKey, setNewKey] = useState("");
  const [mergeConfirm, setMergeConfirm] = useState<{ from: KeyRow; to: string; existing: number } | null>(null);
  const [deleteFor, setDeleteFor] = useState<KeyRow | null>(null);

  const { data: keys = [] } = useQuery({
    queryKey: ["operation-keys-with-counts"],
    queryFn: async (): Promise<KeyRow[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("operation_key")
        .not("operation_key", "is", null);
      if (error) throw error;
      const counts = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        if (r.operation_key) counts.set(r.operation_key, (counts.get(r.operation_key) ?? 0) + 1);
      });
      return [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => a.key.localeCompare(b.key));
    },
  });

  const afterMutation = () => {
    qc.invalidateQueries({ queryKey: ["operation-keys-with-counts"] });
    qc.invalidateQueries({ queryKey: ["operation-keys-distinct"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const rename = useMutation({
    mutationFn: async ({ oldKey, key }: { oldKey: string; key: string }) => {
      const { data, error } = await supabase.rpc("rename_operation_key" as any, {
        _old_key: oldKey,
        _new_key: key,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      afterMutation();
      setRenameFor(null);
      setMergeConfirm(null);
      setNewKey("");
      toast.success(`${res?.affected ?? 0} transação(ões) passaram para ${res?.new_key}.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível renomear a chave."),
  });

  const clear = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.rpc("clear_operation_key" as any, { _key: key });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      afterMutation();
      setDeleteFor(null);
      toast.success(`Chave removida de ${res?.affected ?? 0} transação(ões). Nenhuma transação foi apagada.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível apagar a chave."),
  });

  const normalized = useMemo(() => normalizeOperationKeyInput(newKey).replace(/-+$/, ""), [newKey]);
  const rejection = newKey.trim() ? operationKeyRejectionReason(newKey) : null;
  const existingTarget = keys.find((k) => k.key === normalized);
  const isMerge = Boolean(existingTarget && renameFor && normalized !== renameFor.key);

  if (keys.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Gerir chaves de operação
      </h3>
      <ScrollArea className="h-48 rounded-md border border-border/50">
        <div className="p-1">
          {keys.map(({ key, count }) => {
            const locked = isSystemOperationKey(key);
            return (
              <div key={key} className="rounded px-2 py-1.5 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-mono text-xs">{key}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {count === 1 ? "1 transação" : `${count} transações`}
                  </span>
                  {isAdmin && !locked && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Renomear grupo"
                        onClick={() => {
                          setRenameFor({ key, count });
                          setNewKey(key);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        title="Apagar chave (mantém as transações)"
                        onClick={() => setDeleteFor({ key, count })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {isAdmin && locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </div>
                {isAdmin && locked && (
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    Gerada pelo sistema a partir do id da sessão — não pode ser renomeada nem apagada, senão o
                    próximo fecho criava um grupo novo ao lado deste.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Renomear */}
      <Dialog open={Boolean(renameFor)} onOpenChange={(o) => { if (!o) { setRenameFor(null); setNewKey(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear chave de operação</DialogTitle>
            <DialogDescription>
              Muda a chave em todas as transações do grupo de uma só vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Nome actual: <span className="font-mono">{renameFor?.key}</span>
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome novo</label>
              <Input
                value={newKey}
                onChange={(e) => setNewKey(normalizeOperationKeyInput(e.target.value))}
                placeholder={OPERATION_KEY_EXAMPLE}
                className="font-mono"
              />
              {rejection && <p className="mt-1 text-[11px] text-destructive">{rejection}</p>}
            </div>
            <p className="rounded-md bg-muted/50 p-2 text-xs">
              {isMerge ? (
                <>
                  Isto não é renomear, é <strong>fundir dois grupos</strong>: vai juntar {renameFor?.count} linha(s) a
                  um grupo que já tem {existingTarget?.count}, ficando{" "}
                  {(renameFor?.count ?? 0) + (existingTarget?.count ?? 0)}.
                </>
              ) : (
                <>
                  Vão mudar <strong>{renameFor?.count}</strong> transação(ões) de{" "}
                  <span className="font-mono">{renameFor?.key}</span> para{" "}
                  <span className="font-mono">{normalized || "—"}</span>.
                </>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRenameFor(null); setNewKey(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={
                !renameFor ||
                !isValidOperationKey(normalized) ||
                normalized === renameFor?.key ||
                isSystemOperationKey(normalized) ||
                rename.isPending
              }
              onClick={() => {
                if (!renameFor) return;
                if (isMerge) {
                  setMergeConfirm({ from: renameFor, to: normalized, existing: existingTarget?.count ?? 0 });
                  return;
                }
                rename.mutate({ oldKey: renameFor.key, key: normalized });
              }}
            >
              {isMerge ? "Continuar para fundir…" : "Renomear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação separada da fusão */}
      <Dialog open={Boolean(mergeConfirm)} onOpenChange={(o) => { if (!o) setMergeConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fundir dois grupos</DialogTitle>
            <DialogDescription>
              A chave <span className="font-mono">{mergeConfirm?.to}</span> já existe. Confirmar esta acção junta os
              dois grupos num só — não há como separá-los depois a não ser transação por transação.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Vai juntar <strong>{mergeConfirm?.from.count}</strong> linha(s) de{" "}
            <span className="font-mono">{mergeConfirm?.from.key}</span> a um grupo que já tem{" "}
            <strong>{mergeConfirm?.existing}</strong>, ficando{" "}
            <strong>{(mergeConfirm?.from.count ?? 0) + (mergeConfirm?.existing ?? 0)}</strong>.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeConfirm(null)}>Cancelar</Button>
            <Button
              disabled={rename.isPending}
              onClick={() =>
                mergeConfirm && rename.mutate({ oldKey: mergeConfirm.from.key, key: mergeConfirm.to })
              }
            >
              Fundir os dois grupos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apagar chave */}
      <Dialog open={Boolean(deleteFor)} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar a chave <span className="font-mono">{deleteFor?.key}</span>?</DialogTitle>
            <DialogDescription>
              <strong>Nenhuma transação é apagada.</strong> As {deleteFor?.count} transação(ões) mantêm-se
              exactamente como estão — deixam apenas de estar agrupadas por esta chave.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={clear.isPending}
              onClick={() => deleteFor && clear.mutate(deleteFor.key)}
            >
              Apagar a chave de {deleteFor?.count} transação(ões)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
