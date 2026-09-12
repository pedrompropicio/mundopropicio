import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { stringSimilarity } from "@/lib/string-similarity";
import {
  OPERATION_KEY_EXAMPLE,
  isValidOperationKey,
  normalizeOperationKeyInput,
  operationKeyRejectionReason,
} from "@/lib/operation-key";

/**
 * Chave de operação (D-ERP45) — escolha a partir das chaves que já existem,
 * com criação de chave nova apenas quando o texto cumpre o padrão.
 *
 * Deixou de ser texto livre porque numa chave de agrupamento o erro de escrita
 * é silencioso: uma variante cria um grupo de uma linha e o total do fecho
 * deixa de bater. Aqui recusa-se a chave inválida e sugere-se a parecida.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OperationKeySelector({ value, onChange, disabled }: Props) {
  const [search, setSearch] = useState("");

  // RLS já limita as transações à empresa activa.
  const { data: keys = [] } = useQuery({
    queryKey: ["operation-keys-with-counts"],
    queryFn: async () => {
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

  const options: SearchableSelectOption[] = useMemo(() => {
    const list = keys.map(({ key, count }) => ({
      value: key,
      label: key,
      description: count === 1 ? "1 transação" : `${count} transações`,
    }));
    // A chave da própria transação pode ainda não existir na lista (recém-criada).
    if (value && !keys.some((k) => k.key === value)) {
      list.unshift({ value, label: value, description: "chave desta transação" });
    }
    return list;
  }, [keys, value]);

  // Sugestão de chave parecida enquanto se escreve uma nova.
  const similar = useMemo(() => {
    const q = search.trim();
    if (!q || keys.some((k) => k.key === q)) return null;
    let best: { key: string; score: number } | null = null;
    for (const { key } of keys) {
      const score = stringSimilarity(q, key);
      if (!best || score > best.score) best = { key, score };
    }
    return best && best.score >= 0.6 ? best.key : null;
  }, [search, keys]);

  const invalid = value.trim().length > 0 && !isValidOperationKey(value);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Chave de operação</label>
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        placeholder="Sem chave"
        searchPlaceholder={`Pesquisar ou escrever (ex.: ${OPERATION_KEY_EXAMPLE})`}
        emptyMessage="Nenhuma chave encontrada."
        transformSearch={normalizeOperationKeyInput}
        onSearchChange={setSearch}
        createDisabledReason={operationKeyRejectionReason}
        createLabel={(t) => `Usar chave nova “${t.replace(/-+$/, "")}”`}
        onCreateOption={(text) => {
          const key = normalizeOperationKeyInput(text).replace(/-+$/, "");
          if (!isValidOperationKey(key)) return false;
          onChange(key);
        }}
      />
      {similar ? (
        <p className="mt-1 text-[11px] text-warning">
          Parecida com <span className="font-mono">{similar}</span> — se é o mesmo fecho, escolhe essa em vez de criar outra.
        </p>
      ) : invalid ? (
        <p className="mt-1 text-[11px] text-destructive">
          Chave fora da convenção: {value}. Escolhe uma da lista ou escreve no formato {OPERATION_KEY_EXAMPLE}.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Agrupa as transações do mesmo fecho. Não é limpa por mudança de método nem por liquidação.
        </p>
      )}
    </div>
  );
}
