import React from "react";

interface Props {
  ok: boolean | "warn";
  label: string;
  subtext?: string;
}

export default function StatusBadge({ ok, label, subtext }: Props) {
  const dot =
    ok === true ? "bg-emerald-500" : ok === "warn" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="font-semibold text-foreground">{label}</span>
      {subtext && <span className="text-xs text-muted-foreground">· {subtext}</span>}
    </div>
  );
}
