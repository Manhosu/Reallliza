"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  className?: string;
}

/**
 * Input numerico manual pra quantidade de itens no orcamento
 * (Jessica 27/07 D1). Substitui botoes +/- puros por composto
 * botao-input-botao — permite digitar diretamente pra evitar
 * cliques repetidos em obras grandes (ex: 247.5 m²).
 */
export function QuantityInput({
  value,
  onChange,
  step = 1,
  min = 0,
  className,
}: Props) {
  const [text, setText] = useState<string>(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = parseFloat(text.replace(",", "."));
    if (isNaN(n) || n < min) {
      setText(String(value));
      return;
    }
    onChange(Math.max(min, n));
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onFocus={(e) => e.target.select()}
        className="h-9 w-20 rounded-md border border-input bg-background px-2 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => onChange(value + step)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
