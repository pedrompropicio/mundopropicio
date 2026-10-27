import { Link } from "react-router-dom";
import { LockKeyhole, Wallet, Landmark, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { stageLabel } from "@/lib/event-stage";
import { POSITION_STAGES, formatPositionAmount as eur, formatPositionDate as date, type FinancialPosition } from "@/lib/financial-position";

type BalanceRow = FinancialPosition["cartoes"][number] & { cutoff?: string | null };
const hiddenMessage = "Saldos não visíveis para o seu perfil";
function Money({ value, hidden = false }: { value: number | null; hidden?: boolean }) {
  return <span className="font-mono tabular-nums break-words">{hidden || value === null ? hiddenMessage : eur(value)}</span>;
}
function Accounts({ rows, visible }: { rows: BalanceRow[]; visible: boolean }) {
  if (rows.length === 0) return <p className="py-3 text-sm text-muted-foreground">Sem contas</p>;
  return <ul className="divide-y divide-border">{rows.map(row => <li key={row.account_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><span className="break-words">{row.name}</span>{row.cutoff && <p className="text-xs text-muted-foreground">Data de corte: {date(row.cutoff)}</p>}</div><Money value={row.saldo} hidden={!visible} /></li>)}</ul>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-border pt-6"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>;
}
function Line({ label, value }: { label: string; value: number }) {
  return <div className="flex flex-wrap justify-between gap-2 py-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono tabular-nums">{eur(value)}</span></div>;
}
function Transients({ data }: { data: FinancialPosition["a_pagar"]["transitorias"] }) {
  return <div className="mt-5 border-l-2 border-warning pl-4"><h3 className="font-medium">Transitórias · {eur(data.total)}</h3>{data.itens.length === 0 ? <p className="text-sm text-muted-foreground">Sem transitórias em aberto</p> : data.itens.map(item => <Line key={item.reason} label={`${item.reason || "Sem motivo"} · ${item.n} transações`} value={item.aberto} />)}</div>;
}

/** Display only: no sums, netting, settlement logic or invented defaults. */
export function FinancialPositionView({ data: d }: { data: FinancialPosition }) {
  const visible = d.meta.balances_visible;
  const summary = [
    { label: "Caixa e cartões", value: d.posicao.caixa_e_cartoes, icon: Wallet, balance: true },
    { label: "Retido visível", value: d.posicao.retido_visiveis, icon: Landmark, balance: true },
    // Top cards: stage total without transients (D-ERP322); posicao.a_pagar/a_receber stay validated but not shown.
    { label: "A pagar", value: d.a_pagar.total, icon: ArrowUpRight, balance: false, transients: d.a_pagar.transitorias.total },
    { label: "A receber", value: d.a_receber.total, icon: ArrowDownLeft, balance: false, transients: d.a_receber.transitorias.total },
  ];
  return <div className="space-y-7">
    <section aria-label="Posição"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map(item => <div key={item.label} className="min-w-0 border-l-2 border-primary px-4 py-2"><div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><item.icon className="h-4 w-4" />{item.label}</div><div className="text-xl font-semibold"><Money value={item.value} hidden={item.balance && !visible} /></div>{"transients" in item && <p className="mt-1 text-xs text-muted-foreground">+ transitórias de repasse: <span className="font-mono tabular-nums">{eur(item.transients ?? null)}</span></p>}</div>)}</div><p className="mt-5 text-sm text-muted-foreground">Caixa e retido não somam (D-ERP27)</p></section>
    <Section title="Caixa e retido">
      {!visible && <p className="mb-4 text-sm text-warning">{hiddenMessage}</p>}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <div><h3 className="font-medium">Caixa por conta</h3><Accounts rows={d.caixa} visible={visible} /><h3 className="mt-5 font-medium">Cartões</h3><Accounts rows={d.cartoes} visible={visible} /></div>
        <div><h3 className="flex flex-wrap justify-between gap-2 font-medium"><span>Retido · bilheteiras visíveis</span><Money value={d.retido.total_visiveis} hidden={!visible} /></h3><Accounts rows={d.retido.visivel} visible={visible} /><h3 className="mt-5 flex flex-wrap justify-between gap-2 font-medium"><span>Bilheteiras ocultas · à parte</span><Money value={d.retido.total_ocultas} hidden={!visible} /></h3><Accounts rows={d.retido.ocultas} visible={visible} /></div>
      </div>
    </Section>
    <Section title="A pagar por estágio">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">{POSITION_STAGES.map(stage => {
        const p = d.a_pagar.por_estagio[stage];
        return <div key={stage} className="min-w-0"><h3 className="mb-3 flex flex-wrap justify-between gap-2 font-semibold"><span>{stageLabel(stage)}</span><span className="font-mono">{eur(p.total)}</span></h3><Line label={`BP · ${p.bp_linhas} linhas · ${p.linhas_contrato_cache} de contrato de cachê`} value={p.bp} /><div className="ml-3 border-l border-border pl-3"><Line label="Lançado" value={p.sublinhas.lancado} /><Line label="Confirmado" value={p.sublinhas.confirmado} /><Line label="Por rever" value={p.sublinhas.por_rever} /><Line label="Ajustado" value={p.sublinhas.ajustado} /><Line label="Pago por sócio · fora do total" value={p.sublinhas.partner_paid_fora_do_total} /></div><Line label={`Sem BP · ${p.sem_bp.n} transações`} value={p.sem_bp.total} /><Line label={`Só transações · ${p.so_transacoes.n} transações`} value={p.so_transacoes.total} /></div>;
      })}</div><Transients data={d.a_pagar.transitorias} />
    </Section>
    <Section title="A receber por estágio"><div className="grid gap-x-10 gap-y-3 md:grid-cols-2">{POSITION_STAGES.map(stage => <Line key={stage} label={`${stageLabel(stage)} · ${d.a_receber.por_estagio[stage].n} transações`} value={d.a_receber.por_estagio[stage].total} />)}</div><Transients data={d.a_receber.transitorias} /></Section>
    <Section title="Informativos · fora do total"><h3 className="font-medium">Contas de acerto · fora do total</h3><Accounts rows={d.acerto_informativo.contas} visible={visible} /><Line label={`Caução a recuperar · ${d.acerto_informativo.a_recuperar_caucao.n} registos · fora do total`} value={d.acerto_informativo.a_recuperar_caucao.total} /><h3 className="mb-2 mt-5 font-medium">Operações de terceiros · fora do total</h3>{d.operacoes_terceiros_informativo.length === 0 ? <p className="text-sm text-muted-foreground">Sem operações de terceiros</p> : <ul className="divide-y divide-border">{d.operacoes_terceiros_informativo.map((o, index) => <li key={`${o.event_id}-${index}`} className="py-3"><Link className="text-sm font-medium text-primary hover:underline" to={`/eventos/${o.event_id}`}>{o.name ?? "—"}</Link><p className="text-xs text-muted-foreground">{o.kind ?? "—"}</p><p className="text-sm">Bruto: {eur(o.gross_amount)} · Resultado do operador: {eur(o.operator_result)}</p></li>)}</ul>}</Section>
    <Section title="Alertas"><div className="grid gap-4 md:grid-cols-2"><div className="rounded-md border border-warning/40 p-4"><h3 className="font-medium">Pago acima do BP</h3><p className="mt-2 text-sm">{d.alertas.pago_acima_do_bp.n} linhas · excesso {eur(d.alertas.pago_acima_do_bp.excesso)}</p></div><div className="rounded-md border border-warning/40 p-4"><h3 className="font-medium">BP sem transação</h3><p className="mt-2 text-sm">{d.alertas.bp_sem_transacao.n} linhas · {eur(d.alertas.bp_sem_transacao.total)}</p><p className="text-sm text-muted-foreground">{d.alertas.bp_sem_transacao.por_rever_n} por rever</p></div></div></Section>
    <Section title="Eventos por estágio"><div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">{POSITION_STAGES.map(stage => <div key={stage}><h3 className="mb-2 font-medium">{stageLabel(stage)}</h3>{d.eventos_por_estagio[stage]?.length ? <ul className="divide-y divide-border">{d.eventos_por_estagio[stage]?.map(e => <li key={e.event_id} className="py-3"><Link className="font-medium text-primary hover:underline break-words" to={`/eventos/${e.event_id}`}>{e.name}</Link><p className="mt-1 text-xs text-muted-foreground">1.º dia: {date(e.first_day)} · {e.started ? "Já começou" : "Ainda não começou"} · {e.sub_events} sub-eventos</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Sem eventos</p>}</div>)}</div></Section>
    <Section title="Resultado da MP"><div aria-disabled="true" className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-5 text-muted-foreground"><LockKeyhole className="h-5 w-5 shrink-0" /><span>Disponível com o P5</span></div></Section>
    <footer className="border-t border-border pt-4 text-xs text-muted-foreground">Dados à data de {date(d.meta.reference_date)} · {d.meta.version}</footer>
  </div>;
}