/** PT-PT: mensagens do fluxo v1 e códigos acionáveis do servidor. */
export const adsMessages = {
  title:'Destinos e BP da fatura', destination:'Destino', event:'Evento', company:'Custo próprio da empresa', outside:'Fora do sistema',
  carreira:'Carreira artística', prorate:'Ajuste anónimo proporcional', unresolved:'Escolher destino',
  companyHelp:'Incluído na fatura, sem evento nem linha de BP.', outsideHelp:'Excluído da geração; indique o motivo.',
  bp:'Linha de BP', create:'Criar linha por finalidade', purpose:'Finalidade', observation:'Observação',
  save:'Guardar escolhas e atualizar prévia', confirm:'Confirmar prévia', generate:'Gerar lançamentos', resume:'Retomar documentos',
  reopen:'Reabrir proposta', revert:'Reverter lançamentos', accept:'Aceito este efeito', preview:'Prévia do servidor',
  current:'Verba', committed:'Compromisso', incoming:'Custo do lote', balance:'Saldo após efeitos',
  scopeChanged:'A empresa ou as permissões mudaram. Reabra a fatura.',
  saved:'Escolhas guardadas.', completed:'Operação financeira registada. Consulte os documentos.',
  historical:'Histórico preservado. Reimporte o PDF para preparar o contrato v1; lançamentos históricos não são alterados.',
  master:'Sem evidência inequívoca de cidade: conservar o Master e rever a finalidade.',
  maintenancePending:'A manutenção desta fatura ainda está pendente. Os lançamentos e os documentos mantêm a mesma operação.',
  operationStates:{financial_committed:'Lançamentos registados; documentos pendentes',complete:'Documentos concluídos',reverted:'Lançamentos revertidos'},
  documentStates:{pending:'Pendente',error:'Erro; requer repetição explícita',complete:'Concluído'},
  errors:{
    feature_disabled:'A geração v1 está fechada. Aguarda homologação e ativação autorizada.',
    contract_unavailable:'O contrato v1 não está disponível. Não foi usado outro gerador.',
    preview_stale:'As fontes mudaram. Atualize a prévia e reveja cada aceite.',
    revision_conflict:'Outra pessoa alterou a proposta. Reabra a fatura para rever as escolhas.',
    request_conflict:'O pedido não coincide com a operação guardada. Consulte a operação e reveja a fatura.',
    duplicate_invoice:'Já existem lançamentos para esta fatura. Confira-os antes de gerar.',
    confirmation_required:'Confirme a prévia atual antes de gerar.',
    applied_invoice_changed:'A fatura já tem lançamentos; não é possível alterar a importação.',
    generation_blocked:'A geração está bloqueada. Atualize a prévia para ver os impedimentos.',
    bp_approval_required:'A aprovação do BP exige as permissões e o papel necessários nesta empresa.',
    forbidden:'Não tem acesso ou as permissões necessárias nesta empresa.',
    approval_required:'Aceite cada efeito e preencha a respetiva observação.',
    allocation_required:'Escolha o destino e a linha de BP de cada parcela.',
    financial_source_required:'Falta prova inequívoca de fornecedor/NIF/ligação/conta no PDF e no cadastro.',
    source_attestation_required:'Reimporte o PDF para verificar bytes, identidade e revisão.',
    source_attestation_invalid:'O PDF não corresponde à revisão arquivada. Confira o original e reimporte a fatura.',
    document_digest_mismatch:'Os bytes do documento não coincidem com o original esperado. Confira o arquivo antes de repetir.',
    unsupported_financial_shape:'A composição contém uma filha ou total incluído não positivo. Reveja os destinos sem omitir ajustes.',
    currency_unrepresentable:'A geração exige empresa, fatura e BP em EUR. Não há conversão cambial.',
    currency_mismatch:'A moeda do documento está ausente, ambígua ou é incompatível com as outras fontes. Confira o PDF.',
    ambiguous_master_budget:'A composição do BP Master/cidades é ambígua. Escolha uma linha com composição comprovada.',
    budget_excess:'A rubrica não cobre o lote. Escolha a linha a elevar ou crie uma finalidade explícita.',
    event_locked:'O evento está fechado, histórico, cancelado ou selado.',
    revert_blocked:'A reversão está bloqueada por pagamentos, documentos ou fechos. Nenhum lançamento foi removido.',
    maintenance_retry_blocked:'A manutenção exige revisão operacional; não foi repetido o efeito.',
    maintenance_consumer_required:'A manutenção serial ainda não foi homologada. A tarefa mantém-se pendente.',
    invalid_plan:'Reveja os destinos, valores com duas casas decimais e escolhas de BP.',
  } as Record<string,string>,
};
export function adsError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  return adsMessages.errors[code] ?? code;
}
export function formatAdsMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-PT',{style:'currency',currency}).format(value);
}
