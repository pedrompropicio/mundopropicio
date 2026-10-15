export const FEATURES = {
  SYNC_COALA: "sync-coala",
  SYNC_FEVER: "sync-fever",
  SYNC_HEALTH: "sync-health",
  CRM_CLUBE_NEWGANG: "crm-clube-newgang",
  CRM_SITE_NEWGANG: "crm-site-newgang",
  CRM_COALA_EB27: "crm-coala-eb27",
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

export const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string }> = {
  "sync-coala": {
    label: "Sync Coala (Google Drive)",
    description:
      "Sincronização automática da planilha BP do Coala Festival no Google Drive.",
  },
  "sync-fever": {
    label: "Sync Fever (Reports)",
    description: "Importação automática de relatórios de vendas Fever Up.",
  },
  "sync-health": {
    label: "Sync Health Dashboard",
    description: "Dashboard consolidado de saúde de todos os syncs automáticos.",
  },
  "crm-clube-newgang": {
    label: "MP CRM · Clube Newgang",
    description: "Gestão do clube de fãs Newgang no MP CRM.",
  },
  "crm-site-newgang": {
    label: "MP CRM · Site Newgang",
    description: "Edição do site Newgang no MP CRM.",
  },
  "crm-coala-eb27": {
    label: "MP CRM · Coala Early Bird 27",
    description: "Lista dinâmica dos contactos na lista Early Bird 27 (vista coala_list_members).",
  },
};

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURES);
