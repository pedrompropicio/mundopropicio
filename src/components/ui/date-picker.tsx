import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  /** Date as ISO string yyyy-MM-dd */
  value?: string;
  /** Callback with ISO string yyyy-MM-dd */
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar data…",
  className,
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const dateObj = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  const displayValue = dateObj ? format(dateObj, "dd/MM/yyyy") : "";

  const [inputValue, setInputValue] = React.useState(displayValue);

  // Sync inputValue when value prop changes externally
  React.useEffect(() => {
    setInputValue(dateObj ? format(dateObj, "dd/MM/yyyy") : "");
  }, [value, dateObj]);

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      const iso = format(d, "yyyy-MM-dd");
      onChange(iso);
    }
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d/]/g, "");

    // Auto-insert slashes for dd/mm/yyyy
    const digits = raw.replace(/\//g, "");
    if (digits.length <= 8) {
      let formatted = "";
      for (let i = 0; i < digits.length; i++) {
        if (i === 2 || i === 4) formatted += "/";
        formatted += digits[i];
      }
      raw = formatted;
    }

    setInputValue(raw);

    // Try to parse when we have a complete date
    if (raw.length === 10) {
      const parsed = parse(raw, "dd/MM/yyyy", new Date());
      if (isValid(parsed) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2100) {
        const iso = format(parsed, "yyyy-MM-dd");
        onChange(iso);
      }
    }
  };

  const handleInputBlur = () => {
    // On blur, reset to current valid value if input is invalid
    if (inputValue.length > 0 && inputValue.length < 10) {
      setInputValue(dateObj ? format(dateObj, "dd/MM/yyyy") : "");
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        maxLength={10}
        className="flex-1 h-10"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            size="icon"
            className="h-10 w-10 shrink-0"
            type="button"
          >
            <CalendarIcon className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateObj}
            onSelect={handleSelect}
            locale={pt}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
