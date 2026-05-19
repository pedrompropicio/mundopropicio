import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Pencil, X } from "lucide-react";

type Variant = "text" | "select" | "date";

interface BaseProps {
  value: string | null | undefined;
  onSave: (val: string | null) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

interface TextProps extends BaseProps { variant: "text" }
interface DateProps extends BaseProps { variant: "date" }
interface SelectProps extends BaseProps {
  variant: "select";
  options: { value: string; label: string }[];
}
type Props = TextProps | DateProps | SelectProps;

export function EtapaInlineCell(props: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value ?? "");

  if (!editing) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => { setDraft(props.value ?? ""); setEditing(true); }}
        className="group inline-flex items-center gap-1 text-sm hover:bg-muted/40 rounded px-1 py-0.5 w-full text-left min-h-[1.75rem]"
      >
        <span className={props.value ? "" : "text-muted-foreground italic"}>
          {props.value || props.placeholder || "—"}
        </span>
        {!props.disabled && (
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 ml-auto" />
        )}
      </button>
    );
  }

  const save = async () => {
    await props.onSave(draft.trim() === "" ? null : draft);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      {props.variant === "select" ? (
        <Select value={draft} onValueChange={(v) => { setDraft(v); }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {props.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={props.variant === "date" ? "date" : "text"}
          value={draft}
          autoFocus
          className="h-7 text-xs"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
        />
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={save}>
        <Check className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
