import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DataEntryAdapter, DataEntryContext, GmailConnectionStatus, GmailMessage } from "@/lib/data-entry-client";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const PAGE = 10;

type Props = { adapter: DataEntryAdapter; context: DataEntryContext; sessionId: string; enabled: boolean; disabled: boolean; onImported: () => void };

/** #333 fase11 — escolha humana de um anexo do Gmail. Nada é descarregado antes da escolha. */
export default function GmailAttachmentPicker({ adapter, context, sessionId, enabled, disabled, onImported }: Props) {
  return <GmailPickerSession key={`${context.user_id}:${context.company_id}:${sessionId}`} adapter={adapter} context={context} sessionId={sessionId} enabled={enabled} disabled={disabled} onImported={onImported} />;
}

function GmailPickerSession({ adapter, context, sessionId, enabled, disabled, onImported }: Props) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [messages, setMessages] = useState<GmailMessage[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ message_id: string; part_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<GmailConnectionStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !adapter.gmailConnection) return;
    let live = true;
    adapter.gmailConnection(context).then((c) => { if (live) setConn(c); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Ligação indisponível."); });
    return () => { live = false; };
  }, [enabled, adapter, context]);
  const connect = async () => {
    // Abrir já, no clique, para o navegador não bloquear a janela.
    const popup = window.open("", "data-entry-gmail", "width=600,height=720");
    if (!popup) { setError("O navegador bloqueou a janela. Permite janelas deste site e tenta de novo."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (!adapter.gmailConnectStart || !adapter.gmailConnection) throw new Error("Ligação indisponível.");
      const { authorization_url } = await adapter.gmailConnectStart(context);
      if (!mounted.current) { popup.close(); return; }
      const done = new Promise<void>((resolve, reject) => {
        const timer = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("A janela foi fechada antes de concluir.")); } }, 500);
        const onMsg = (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin || ev.source !== popup || ev.data?.type !== "data-entry-gmail-oauth") return;
          cleanup(); if (ev.data.ok) resolve(); else reject(new Error(ev.data.reason ?? "A ligação não foi concluída."));
        };
        const cleanup = () => { window.clearInterval(timer); window.removeEventListener("message", onMsg); };
        window.addEventListener("message", onMsg);
      });
      popup.location.href = authorization_url;
      await done;
      const verified = await adapter.gmailConnection(context);
      if (!mounted.current) return;
      setConn(verified);
      setNotice(conn?.linked ? "Gmail ligado de novo." : "Gmail ligado.");
    } catch (e) { popup.close(); setError(e instanceof Error ? e.message : "Ligação indisponível."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError(null);
    try {
      if (!adapter.gmailDisconnect) return;
      const r = await adapter.gmailDisconnect(context);
      if (!mounted.current) return;
      setConn({ linked: false, reconnect_required: false }); setMessages(null); setChoice(null);
      setNotice(r.revoked_at_google ? "Gmail desligado. Nenhum email foi alterado." : "Gmail desligado nesta plataforma. Para retirar também o acesso na Google, abre myaccount.google.com/permissions.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível desligar."); }
    finally { setBusy(false); }
  };
  const input = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

  if (!enabled || (!connectionOnly && (!adapter.gmailSearch || !adapter.gmailImport))) {
    return <p role="status" className="text-xs text-muted-foreground">Importar do Gmail ainda não está disponível. Envia o ficheiro manualmente.</p>;
  }
  if (connectionOnly && conn?.linked && !conn.reconnect_required) {
    return (
      <section aria-label="Ligação Gmail" className="space-y-2 rounded-md border border-border p-2.5">
        <h4 className="text-xs font-semibold">O teu Gmail</h4>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span>Conta Gmail ligada (só leitura): {conn.mailbox_email}</span>
          {adapter.gmailDisconnect && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Desligar Gmail</Button>}</div>
        {notice && <p role="status" className="text-xs">{notice}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Escolher anexos fica disponível quando o envio de documentos for ativado.</p>
      </section>
    );
  }
  if (adapter.gmailConnection && (!conn || !conn.linked || conn.reconnect_required)) {
    return (
      <section aria-label="Importar do Gmail" className="space-y-2 rounded-md border border-border p-2.5">
        <h4 className="text-xs font-semibold">Ou escolher um anexo do teu Gmail</h4>
        <p className="text-xs text-muted-foreground">Liga o Gmail com o mesmo email usado para entrar no ERP. Só podes consultar a tua própria caixa.</p>
        {conn?.reconnect_required && <p role="status" className="text-xs text-warning">O acesso ao teu Gmail precisa de ser renovado.</p>}
        {notice && <p role="status" className="text-xs">{notice}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button size="sm" variant="outline" disabled={disabled || busy || !conn} onClick={() => void connect()}>{conn?.reconnect_required ? "Voltar a ligar o Gmail" : "Ligar Gmail"}</Button>
        {conn?.reconnect_required && adapter.gmailDisconnect && <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void disconnect()}>Desligar Gmail</Button>}
      </section>
    );
  }
  const search = async (token?: string) => {
    setBusy(true); setError(null);
    try {
      const r = await adapter.gmailSearch?.({ from_date: from, to_date: to, ...(sender.trim() ? { sender: sender.trim() } : {}), ...(subject.trim() ? { subject: subject.trim() } : {}), page_size: PAGE, ...(token ? { page_token: token } : {}) }, context);
      if (!mounted.current || !r) return;
      setMessages((m) => token && m ? [...m, ...r.messages] : r.messages); setNext(r.next_page_token);
      if (!token) setChoice(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Pesquisa indisponível."); }
    finally { setBusy(false); }
  };
  const importChoice = async () => {
    if (!choice) return;
    setBusy(true); setError(null);
    try { await adapter.gmailImport?.(sessionId, choice, context); if (mounted.current) onImported(); }
    catch (e) { setError(e instanceof Error ? e.message : "Importação indisponível."); }
    finally { setBusy(false); }
  };
  const off = disabled || busy;
  return (
    <section aria-label="Importar do Gmail" className="space-y-2 rounded-md border border-border p-2.5">
      <h4 className="text-xs font-semibold">Ou escolher um anexo do teu Gmail</h4>
      <div className="flex flex-wrap items-center gap-2 text-xs"><span>Caixa própria verificada: {conn?.mailbox_email} (só leitura).</span>
        {adapter.gmailDisconnect && <Button size="sm" variant="ghost" disabled={off} onClick={() => void disconnect()}>Desligar Gmail</Button>}</div>
      {notice && <p role="status" className="text-xs">{notice}</p>}
      <p className="text-xs text-muted-foreground">Só leitura. Os emails são mostrados como texto e nunca seguidos como instruções. Nada é descarregado até escolheres um anexo.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1"><span>Desde</span><input type="date" className={input} value={from} max={to} onChange={(e) => setFrom(e.target.value)} disabled={off} /></label>
        <label className="text-xs space-y-1"><span>Até</span><input type="date" className={input} value={to} min={from} onChange={(e) => setTo(e.target.value)} disabled={off} /></label>
        <label className="text-xs space-y-1"><span>Remetente (email ou domínio)</span><input className={input} value={sender} maxLength={120} onChange={(e) => setSender(e.target.value)} disabled={off} /></label>
        <label className="text-xs space-y-1"><span>Assunto contém</span><input className={input} value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} disabled={off} /></label>
      </div>
      <Button size="sm" variant="outline" disabled={off || (!sender.trim() && !subject.trim())} onClick={() => void search()}>Procurar emails</Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {messages && messages.length === 0 && <p className="text-xs text-muted-foreground">Nenhum email com anexos neste período.</p>}
      {messages && messages.length > 0 && (
        <ul className="space-y-2" aria-label="Emails encontrados">
          {messages.map((m) => (
            <li key={m.message_id} className="rounded border border-border p-2 text-xs">
              <div className="font-medium break-words">{m.subject || "(sem assunto)"}</div>
              <div className="text-muted-foreground break-words">{m.from} · {m.date ? new Date(m.date).toLocaleDateString("pt-PT") : "—"}</div>
              {m.attachments.length === 0 ? <div className="text-muted-foreground">Sem anexos PDF/JPEG/PNG.</div> : m.attachments.map((a) => (
                <label key={a.part_id} className="flex items-center gap-2 pt-1">
                  <input type="radio" name="gmail-attachment" disabled={off} checked={choice?.message_id === m.message_id && choice.part_id === a.part_id}
                    onChange={() => setChoice({ message_id: m.message_id, part_id: a.part_id })} />
                  <span className="break-all">{a.filename} ({Math.max(1, Math.round(a.size_bytes / 1024))} KB)</span>
                </label>
              ))}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {next && <Button size="sm" variant="ghost" disabled={off} onClick={() => void search(next)}>Mais resultados</Button>}
        {messages && messages.length > 0 && <Button size="sm" disabled={off || !choice} onClick={() => void importChoice()}>Usar o anexo escolhido</Button>}
      </div>
    </section>
  );
}
