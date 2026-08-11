"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Indicador do dashboard do almoxarifado.
 *
 * Spec seção 4: "Ao clicar em qualquer indicador, o sistema deverá abrir a
 * tela correspondente já filtrada." Por isso o tile é um link quando recebe
 * `href` — é essa a função dele, não só mostrar número.
 */
export function KpiTile({
  label,
  value,
  href,
  icon: Icon,
  accent = "zinc",
  hint,
  isLoading,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon?: React.ElementType;
  accent?: "zinc" | "green" | "amber" | "blue" | "red" | "purple" | "cyan" | "orange";
  hint?: string;
  isLoading?: boolean;
}) {
  const ACCENTS: Record<string, { border: string; text: string; bg: string }> = {
    zinc: { border: "border-t-zinc-500", text: "text-zinc-400", bg: "bg-zinc-500/10" },
    green: { border: "border-t-green-500", text: "text-green-500", bg: "bg-green-500/10" },
    amber: { border: "border-t-amber-500", text: "text-amber-500", bg: "bg-amber-500/10" },
    blue: { border: "border-t-blue-500", text: "text-blue-500", bg: "bg-blue-500/10" },
    red: { border: "border-t-red-500", text: "text-red-500", bg: "bg-red-500/10" },
    purple: { border: "border-t-purple-500", text: "text-purple-400", bg: "bg-purple-500/10" },
    cyan: { border: "border-t-cyan-500", text: "text-cyan-500", bg: "bg-cyan-500/10" },
    orange: { border: "border-t-orange-500", text: "text-orange-500", bg: "bg-orange-500/10" },
  };
  const tone = ACCENTS[accent] ?? ACCENTS.zinc;

  const inner = (
    <div
      className={cn(
        "rounded-xl border border-t-2 bg-card p-4 shadow-sm transition-all",
        tone.border,
        href && "hover:-translate-y-0.5 hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("rounded-lg p-1.5", tone.bg)}>
            <Icon className={cn("h-3.5 w-3.5", tone.text)} />
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-secondary" />
      ) : (
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone.text)}>
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
