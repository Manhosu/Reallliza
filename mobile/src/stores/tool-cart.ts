import { create } from 'zustand';
import { ToolInventory } from '../lib/types';

export interface CartLine {
  tool: ToolInventory;
  quantity: number;
}

interface ToolCartState {
  items: Record<string, CartLine>;
  add: (tool: ToolInventory, qty?: number) => void;
  setQuantity: (toolId: string, qty: number) => void;
  remove: (toolId: string) => void;
  clear: () => void;
  getTotalCount: () => number;
  getTotalItems: () => number;
  getLine: (toolId: string) => CartLine | undefined;
}

/**
 * Quantas unidades desta ferramenta o técnico pode pedir.
 *
 * Jessica 12/08: o Iago pediu 3 parafusadeiras havendo 1. O carrinho tinha
 * piso mas não teto, e a disponibilidade — que já estava aqui dentro, em
 * `CartLine.tool` — nunca era consultada.
 */
export const availableFor = (tool: ToolInventory): number => {
  const t = tool as unknown as {
    available_quantity?: number;
    quantity_available?: number;
  };
  // available_quantity é o valor calculado pelo servidor (unidades livres para
  // tipos controlados, saldo para os de quantidade). O fallback existe só para
  // versões antigas da API.
  const n = t.available_quantity ?? t.quantity_available ?? 0;
  return Math.max(0, Math.floor(Number(n) || 0));
};

const clampQty = (n: number, max: number): number => {
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  return Math.min(Math.floor(n), Math.max(1, max));
};

export const useToolCart = create<ToolCartState>((set, get) => ({
  items: {},

  add: (tool, qty = 1) => {
    set((state) => {
      const existing = state.items[tool.id];
      const newQty = clampQty(
        (existing?.quantity ?? 0) + qty,
        availableFor(tool)
      );
      return {
        items: {
          ...state.items,
          [tool.id]: { tool, quantity: newQty },
        },
      };
    });
  },

  setQuantity: (toolId, qty) => {
    set((state) => {
      const existing = state.items[toolId];
      if (!existing) return state;
      if (qty <= 0) {
        const { [toolId]: _removed, ...rest } = state.items;
        return { items: rest };
      }
      return {
        items: {
          ...state.items,
          [toolId]: {
            ...existing,
            quantity: clampQty(qty, availableFor(existing.tool)),
          },
        },
      };
    });
  },

  remove: (toolId) => {
    set((state) => {
      const { [toolId]: _removed, ...rest } = state.items;
      return { items: rest };
    });
  },

  clear: () => set({ items: {} }),

  /** Numero de ferramentas distintas no carrinho */
  getTotalItems: () => Object.keys(get().items).length,

  /** Soma das quantidades de todas as ferramentas */
  getTotalCount: () =>
    Object.values(get().items).reduce((acc, l) => acc + l.quantity, 0),

  getLine: (toolId) => get().items[toolId],
}));
