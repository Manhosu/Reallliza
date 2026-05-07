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

const clampQty = (n: number): number => {
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  return Math.floor(n);
};

export const useToolCart = create<ToolCartState>((set, get) => ({
  items: {},

  add: (tool, qty = 1) => {
    set((state) => {
      const existing = state.items[tool.id];
      const newQty = clampQty((existing?.quantity ?? 0) + qty);
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
          [toolId]: { ...existing, quantity: clampQty(qty) },
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
