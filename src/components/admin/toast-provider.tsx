"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { Toast, type ToastMessage } from "@/components/admin/toast";

// Pop-up messages for the admin portal (Style §11.12, Admin §1): success closes after
// 6 seconds unless hovered or focused; errors stay until dismissed. Screen readers
// hear each one (WCAG 4.1.3) through its role.

type ToastInput = Omit<ToastMessage, "id">;

type ToastContextValue = { showToast: (toast: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = useCallback((toast: ToastInput) => {
    setToasts((current) => [...current, { ...toast, id: crypto.randomUUID() }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const contextValue = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed inset-x-4 bottom-4 z-50 grid gap-2 md:inset-x-auto md:top-6 md:right-6 md:bottom-auto md:w-full md:max-w-toast">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
