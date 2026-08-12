"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Boxes,
  Undo2,
  Wrench,
  Ban,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shell do módulo Almoxarifado.
 *
 * Spec seção 3: o módulo tem 8 áreas. Mantemos o shell do Reallliza (tema e
 * sidebar geral) e criamos aqui a navegação interna, em vez de uma sidebar
 * paralela — o mockup mostra um produto separado, mas a instrução do texto é
 * "reaproveitar a estrutura já existente, sem criar módulos duplicados".
 *
 * O Histórico não é aba: chega-se a ele pela unidade, a partir de qualquer
 * tela onde ela apareça (seção 3).
 */
const AREAS = [
  { href: "/ferramentas", label: "Dashboard", icon: LayoutDashboard, exact: true },
  // Catálogo = cadastro do TIPO. Inventário = as peças físicas. A separação
  // não estava clara e a cliente não achou onde cadastrar a ferramenta.
  { href: "/ferramentas/catalogo", label: "Catálogo", icon: Wrench },
  { href: "/ferramentas/inventario", label: "Inventário", icon: Package },
  { href: "/ferramentas/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/ferramentas/custodias", label: "Custódias", icon: Boxes },
  { href: "/ferramentas/devolucoes", label: "Devoluções", icon: Undo2 },
  { href: "/ferramentas/manutencao", label: "Manutenção", icon: Wrench },
  { href: "/ferramentas/baixas", label: "Baixas", icon: Ban },
  { href: "/ferramentas/busca", label: "Pesquisa", icon: Search },
];

export default function FerramentasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const isActive = (area: (typeof AREAS)[number]) =>
    area.exact ? pathname === area.href : pathname.startsWith(area.href);

  return (
    <div className="space-y-6">
      {/* Busca sempre visível no topo do módulo (seção 5) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) {
            router.push(`/ferramentas/busca?q=${encodeURIComponent(query.trim())}`);
          }
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ferramenta, código, patrimônio, série, técnico, obra ou OS..."
          className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      {/* Navegação das áreas */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {AREAS.map((area) => {
          const active = isActive(area);
          const Icon = area.icon;
          return (
            <Link
              key={area.href}
              href={area.href}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {area.label}
              {active && (
                <motion.div
                  layoutId="almoxAreaTab"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
