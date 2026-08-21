import { PLATFORM_COLOR_VAR, PLATFORM_LABEL, type AdPlatform } from "@/lib/crm/platform";

/**
 * Indicador discreto de plataforma. A cor (--chart-1 Meta / --chart-2 Google)
 * nunca vai sozinha: vem sempre com o nome em texto.
 */
export function PlatformBadge({ platform }: { platform: AdPlatform }) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: PLATFORM_COLOR_VAR[platform] }}
      />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
