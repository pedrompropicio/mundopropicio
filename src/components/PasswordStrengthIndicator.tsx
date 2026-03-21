import { useMemo } from "react";

interface Props {
  password: string;
}

export const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Carácter especial (!@#$…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function validatePassword(password: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) {
      return `A senha deve ter: ${rule.label.toLowerCase()}`;
    }
  }
  return null;
}

export function PasswordStrengthIndicator({ password }: Props) {
  const passed = useMemo(() => PASSWORD_RULES.filter((r) => r.test(password)).length, [password]);
  const strength = passed === 0 ? 0 : passed <= 2 ? 1 : passed <= 3 ? 2 : 3;
  const labels = ["", "Fraca", "Média", "Forte"];
  const colors = ["", "bg-destructive", "bg-amber-500", "bg-emerald-500"];

  if (!password) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= strength ? colors[strength] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${strength <= 1 ? "text-destructive" : strength === 2 ? "text-amber-500" : "text-emerald-500"}`}>
          {labels[strength]}
        </span>
      </div>
      <ul className="space-y-0.5">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.test(password) ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span>{rule.test(password) ? "✓" : "○"}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
