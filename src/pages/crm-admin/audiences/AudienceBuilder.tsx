import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Criterion,
  type CriterionField,
  type CriterionFilter,
  type CriterionOp,
  FIELD_META,
  OP_LABELS,
  defaultFilterFor,
} from "./audienceCriterion";

interface Props {
  criterion: Criterion;
  onChange: (next: Criterion) => void;
  readOnly?: boolean;
}

export default function AudienceBuilder({ criterion, onChange, readOnly }: Props) {
  const setMatch = (m: "all" | "any") => onChange({ ...criterion, match: m });

  const setFilter = (i: number, next: CriterionFilter) => {
    const arr = criterion.filters.slice();
    arr[i] = next;
    onChange({ ...criterion, filters: arr });
  };

  const removeFilter = (i: number) => {
    const arr = criterion.filters.slice();
    arr.splice(i, 1);
    onChange({ ...criterion, filters: arr });
  };

  const addFilter = () => {
    onChange({
      ...criterion,
      filters: [...criterion.filters, defaultFilterFor("source")],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={criterion.match === "all"}
            onChange={() => setMatch("all")}
            disabled={readOnly}
          />
          Corresponder TODOS
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={criterion.match === "any"}
            onChange={() => setMatch("any")}
            disabled={readOnly}
          />
          Corresponder QUALQUER
        </label>
      </div>

      {criterion.filters.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sem filtros — todos os contactos correspondem.
        </p>
      )}

      <div className="space-y-2">
        {criterion.filters.map((f, i) => (
          <FilterRow
            key={i}
            filter={f}
            onChange={(next) => setFilter(i, next)}
            onRemove={() => removeFilter(i)}
            readOnly={readOnly}
          />
        ))}
      </div>

      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          onClick={addFilter}
          className="border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
        >
          <Plus className="h-3 w-3" /> Adicionar filtro
        </Button>
      )}
    </div>
  );
}

function FilterRow({
  filter,
  onChange,
  onRemove,
  readOnly,
}: {
  filter: CriterionFilter;
  onChange: (next: CriterionFilter) => void;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  const meta = FIELD_META[filter.field];

  const setField = (field: CriterionField) => {
    onChange(defaultFilterFor(field));
  };
  const setOp = (op: CriterionOp) => {
    // reset value to a sensible default for this op
    const next: CriterionFilter = { ...filter, op };
    if (op === "in") next.value = Array.isArray(filter.value) ? filter.value : [];
    if (op === "last_n_days") next.value = typeof filter.value === "number" ? filter.value : 30;
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filter.field} onValueChange={(v) => setField(v as CriterionField)} disabled={readOnly}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(FIELD_META) as CriterionField[]).map((k) => (
            <SelectItem key={k} value={k}>{FIELD_META[k].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter.op} onValueChange={(v) => setOp(v as CriterionOp)} disabled={readOnly}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {meta.allowedOps.map((o) => (
            <SelectItem key={o} value={o}>{OP_LABELS[o]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ValueInput filter={filter} onChange={onChange} readOnly={readOnly} />

      {!readOnly && (
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

function ValueInput({
  filter,
  onChange,
  readOnly,
}: {
  filter: CriterionFilter;
  onChange: (next: CriterionFilter) => void;
  readOnly?: boolean;
}) {
  const meta = FIELD_META[filter.field];

  if (meta.type === "bool" || meta.type === "computed") {
    return (
      <Select
        value={String(Boolean(filter.value))}
        onValueChange={(v) => onChange({ ...filter, value: v === "true" })}
        disabled={readOnly}
      >
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Sim</SelectItem>
          <SelectItem value="false">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (meta.type === "text") {
    if (filter.op === "in") {
      const arr = Array.isArray(filter.value) ? (filter.value as string[]) : [];
      return (
        <Input
          className="w-64"
          placeholder="valor1, valor2"
          value={arr.join(", ")}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              ...filter,
              value: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      );
    }
    return (
      <Input
        className="w-64"
        value={String(filter.value ?? "")}
        disabled={readOnly}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
      />
    );
  }

  // timestamp
  if (filter.op === "last_n_days") {
    return (
      <Input
        type="number"
        min={1}
        className="w-24"
        value={Number(filter.value) || 30}
        disabled={readOnly}
        onChange={(e) => onChange({ ...filter, value: Number(e.target.value) })}
      />
    );
  }
  return (
    <Input
      type="date"
      className="w-40"
      value={typeof filter.value === "string" ? filter.value.slice(0, 10) : ""}
      disabled={readOnly}
      onChange={(e) => onChange({ ...filter, value: e.target.value })}
    />
  );
}
