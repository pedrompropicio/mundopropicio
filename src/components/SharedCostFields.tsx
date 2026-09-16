/**
 * Custo partilhado com terceiros (D-ERP69) — marcação da linha e desdobramento
 * da fatura.
 *
 * Bloco recolhido por omissão, só em despesas. Escolher uma conta de circuito
 * significa "esta linha não é custo da MP: é adiantamento por conta de
 * terceiros". A imposição de `exclude_from_result` é do trigger; aqui só se
 * reflecte.
 *
 * Desdobramento (só na criação): indicando a PARTE DE TERCEIROS em % ou em €
 * sobre a base s/IVA, a gravação cria DUAS pernas no mesmo `invoice_group_id`
 * — perna da MP (total − parte, despesa normal, com linha de BP) e perna de
 * terceiros (a parte, com a conta de circuito). O resto do arredondamento fica
 * sempre na perna da MP: a de terceiros é dinheiro de outrem.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Handshake, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { useCircuitAccounts } from "@/lib/circuit-account";

export type ThirdPartyShareMode = "percentage" | "absolute";

interface Props {
  accountId: string;
  counterpartyId: string;
  onChange: (next: { accountId: string; counterpartyId: string }) => void;
  /** Valor bruto (base + IVA) da linha, para o texto explicativo. */
  grossAmount: number;
  suppliers: Array<{ id: string; name: string }>;
  disabled?: boolean;

  /** ---- Desdobramento (opcional; só na criação) ---- */
  split?: {
    /** Base s/IVA total introduzida no formulário. */
    totalNet: number;
    /** Taxa de IVA da linha (%), igual nas duas pernas. */
    ivaRate: number;
    mode: ThirdPartyShareMode;
    /** Texto cru do campo (percentagem ou euros). */
    value: string;
    /** Evento da perna de terceiros (obrigatório quando desdobra). */
    eventId: string;
    events: Array<{ id: string; name: string }>;
    onModeChange: (mode: ThirdPartyShareMode) => void;
    onValueChange: (value: string) => void;
    onEventChange: (eventId: string) => void;
    /** Quando presente, o desdobramento está indisponível e explica-se porquê. */
    unavailableReason?: string | null;
    /**
     * Nº de linhas do "Dividir por IVA" (≥2 = fatura multi-IVA). Nesse caso a parte
     * aplica-se a CADA linha pela mesma percentagem e o modo € é recusado, por ser
     * ambíguo entre taxas.
     */
    multiIvaLineCount?: number;
  };
}

/** Parte de terceiros em base s/IVA. O resto do arredondamento fica na MP. */
export function computeThirdPartyNet(
  totalNet: number,
  mode: ThirdPartyShareMode,
  raw: string,
): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || !(totalNet > 0)) return 0;
  if (mode === "percentage") return Number(((totalNet * n) / 100).toFixed(2));
  return Number(n.toFixed(2));
}

export function SharedCostFields({
  accountId,
  counterpartyId,
  onChange,
  grossAmount,
  suppliers,
  disabled,
  split,
}: Props) {
  const { data: circuitAccounts = [] } = useCircuitAccounts();
  const [open, setOpen] = useState(!!accountId);

  // Sem contas de circuito configuradas o bloco não tem o que oferecer.
  if (circuitAccounts.length === 0 && !accountId) return null;

  const chosen = circuitAccounts.find((a) => a.id === accountId);

  const totalNet = split?.totalNet ?? 0;
  const thirdNet = split ? computeThirdPartyNet(totalNet, split.mode, split.value) : 0;
  const splitFilled = !!split && split.value.trim() !== "";
  const splitInvalid = splitFilled && (thirdNet <= 0 || thirdNet >= totalNet);
  const splitActive = splitFilled && !splitInvalid && !split?.unavailableReason;
  const mpNet = splitActive ? Number((totalNet - thirdNet).toFixed(2)) : totalNet;
  const mult = 1 + (Number(split?.ivaRate) || 0) / 100;
  const isMultiIva = (split?.multiIvaLineCount ?? 0) >= 2;

  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Handshake className="h-4 w-4 text-primary" />
        <span>Custo partilhado com terceiros</span>
        {accountId && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {splitActive ? "Fatura desdobrada" : "Parte de terceiros"}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Conta corrente do circuito
            </label>
            <select
              value={accountId}
              disabled={disabled}
              onChange={(e) => onChange({ accountId: e.target.value, counterpartyId })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            >
              <option value="">Não é custo partilhado</option>
              {circuitAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Terceiro (opcional)
            </label>
            <select
              value={counterpartyId}
              disabled={disabled || !accountId}
              onChange={(e) => onChange({ accountId, counterpartyId: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            >
              <option value="">Sem contraparte atribuída</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Atribuir o terceiro é o que torna a posição do circuito legível por contraparte.
            </p>
          </div>

          {/* ---- Desdobramento da fatura ---- */}
          {split && accountId && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Parte de terceiros (sobre a base s/IVA)
                </label>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {(["percentage", "absolute"] as ThirdPartyShareMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={
                        disabled ||
                        !!split.unavailableReason ||
                        (isMultiIva && m === "absolute")
                      }
                      title={
                        isMultiIva && m === "absolute"
                          ? "Numa fatura com várias taxas de IVA a parte de terceiros indica-se em percentagem: um valor em € é ambíguo entre as linhas."
                          : undefined
                      }
                      onClick={() => split.onModeChange(m)}
                      className={`px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        split.mode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "percentage" ? "%" : "€"}
                    </button>
                  ))}
                </div>
              </div>

              {isMultiIva && !split.unavailableReason && (
                <p className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[10px] text-primary">
                  Fatura com {split.multiIvaLineCount} taxas de IVA: a percentagem aplica-se a{" "}
                  <strong>cada linha</strong>, com a taxa dessa linha. Nascem duas pernas por
                  linha ({(split.multiIvaLineCount ?? 0) * 2} no total), todas no mesmo grupo de
                  fatura. Só o modo % é aceite.
                </p>
              )}

              {split.unavailableReason ? (
                <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{split.unavailableReason}</span>
                </p>
              ) : (
                <>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={split.value}
                    disabled={disabled || !(totalNet > 0)}
                    onChange={(e) => split.onValueChange(e.target.value)}
                    placeholder={
                      totalNet > 0
                        ? split.mode === "percentage"
                          ? "Vazio = a linha inteira é de terceiros"
                          : `Vazio = a linha inteira é de terceiros (${totalNet.toFixed(2)} € s/IVA)`
                        : "Preenche o Valor (€) da fatura primeiro"
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${
                      splitInvalid
                        ? "border-destructive bg-destructive/5 focus:ring-destructive/40"
                        : "border-border bg-background focus:ring-primary/50"
                    }`}
                  />
                  {splitInvalid && (
                    <p className="text-[10px] text-destructive">
                      A parte de terceiros tem de ser maior que 0 e menor que o total
                      ({totalNet.toFixed(2)} € s/IVA). A zero é uma despesa normal; pelo total
                      inteiro basta marcar a linha com a conta de circuito, sem desdobrar.
                    </p>
                  )}

                  {splitActive && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Evento da perna de terceiros *
                        </label>
                        <select
                          value={split.eventId}
                          disabled={disabled}
                          onChange={(e) => split.onEventChange(e.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                            split.eventId
                              ? "border-border bg-background focus:ring-primary/50"
                              : "border-destructive bg-destructive/5 focus:ring-destructive/40"
                          }`}
                        >
                          <option value="">Selecionar evento…</option>
                          {split.events.map((ev) => (
                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Num circuito de turnê o natural é o evento Master. Nunca pode ficar
                          sem evento: o blocker de fecho procura as contas de circuito pelas
                          transações com evento, e sem evento o circuito passa o fecho sem aviso.
                        </p>
                      </div>

                      <div className="space-y-0.5 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="font-medium text-muted-foreground">Como fica a repartição</div>
                        <div className="flex justify-between gap-3">
                          <span>Parte da MP (custo, com linha de BP)</span>
                          <span className="font-mono">
                            {mpNet.toFixed(2)} € s/IVA · {(mpNet * mult).toFixed(2)} € c/IVA
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Parte de terceiros (adiantamento)</span>
                          <span className="font-mono">
                            {thirdNet.toFixed(2)} € s/IVA · {(thirdNet * mult).toFixed(2)} € c/IVA
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-border/60 pt-0.5 font-medium">
                          <span>Total da fatura</span>
                          <span className="font-mono">
                            {totalNet.toFixed(2)} € s/IVA · {(totalNet * mult).toFixed(2)} € c/IVA
                          </span>
                        </div>
                        <div className="border-t border-border/60 pt-1 text-muted-foreground">
                          Duas linhas no mesmo grupo de fatura — uma só transferência na Lista de
                          Pagamento. Só a perna de terceiros fica fora do resultado.
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {chosen && !splitActive && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              Esta linha não é custo da MP. Fica fora do resultado, não consome verba do BP e,
              quando for paga, vai gerar automaticamente{" "}
              <strong>{formatCurrency(grossAmount || 0)}</strong> na conta{" "}
              <strong>{chosen.name}</strong>, que passa a ser o que o terceiro nos deve.
            </p>
          )}

          {chosen && splitActive && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              Quando a perna de terceiros for paga, vai gerar automaticamente{" "}
              <strong>{formatCurrency(thirdNet * mult)}</strong> na conta{" "}
              <strong>{chosen.name}</strong>. A perna da MP é despesa normal do evento.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SharedCostFields;
