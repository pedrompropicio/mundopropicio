export const FEATURES = {
  SYNC_COALA: "sync-coala",
  SYNC_FEVER: "sync-fever",
  SYNC_HEALTH: "sync-health",
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
};

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURES);
