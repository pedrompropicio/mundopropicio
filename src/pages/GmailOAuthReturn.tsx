import { useEffect, useState } from "react";
import { completeGmailConnection } from "@/lib/data-entry-client";

const MSG = "data-entry-gmail-oauth";

/** #333 — retorno da Google. Só envia o código de uso único e o vínculo ao servidor. */
export default function GmailOAuthReturn() {
  const [message, setMessage] = useState("A concluir a ligação ao Gmail…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Limpa o endereço para o código não ficar no histórico.
    window.history.replaceState(null, "", window.location.pathname);
    const notify = (ok: boolean, reason?: string) => {
      window.opener?.postMessage({ type: MSG, ok, reason }, window.location.origin);
      if (ok) window.close();
    };
    const binding = params.get("binding") ?? "";
    const code = params.get("code") ?? "";
    if (params.get("success") !== "true") { setMessage("A ligação não foi concluída. Fecha esta janela e tenta de novo."); notify(false); return; }
    if (!code) {
      const reason = params.get("offline_access_allowed") === "false"
        ? "Esta ligação ainda não pode ser usada: o administrador tem de permitir acesso contínuo no cliente Google da plataforma."
        : "A Google não devolveu a confirmação. Tenta de novo.";
      setMessage(reason); notify(false, reason); return;
    }
    completeGmailConnection(binding, code)
      .then(() => { setMessage("Gmail ligado. Podes fechar esta janela."); notify(true); })
      .catch((e) => { const reason = e instanceof Error ? e.message : "Não foi possível concluir a ligação."; setMessage(reason); notify(false, reason); });
  }, []);
  return <main className="p-6 text-sm"><p role="status">{message}</p></main>;
}
