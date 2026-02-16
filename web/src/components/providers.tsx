"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--card-foreground)",
          },
        }}
        richColors
        closeButton
      />
    </>
  );
}
