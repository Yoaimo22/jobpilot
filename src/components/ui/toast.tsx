"use client";
import * as React from "react";

type Toast = { id: number; title: string; description?: string; variant?: "default" | "error" | "success" };

const ToastCtx = React.createContext<{
  toast: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "rounded-lg border p-3 shadow-lg bg-card text-card-foreground text-sm animate-in " +
              (t.variant === "error"
                ? "border-red-500/40"
                : t.variant === "success"
                  ? "border-green-500/40"
                  : "border-border")
            }
          >
            <div className="font-medium">{t.title}</div>
            {t.description && <div className="text-muted-foreground mt-0.5">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) return { toast: () => {} };
  return ctx;
}
