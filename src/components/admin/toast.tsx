"use client";

import { useEffect, useRef, useState } from "react";

import { Message, type MessageTone } from "@/components/ui/message";
import { getButtonClassName } from "@/components/ui/button-link";

const SUCCESS_TOAST_MS = 6000;

export type ToastMessage = {
  id: string;
  tone: MessageTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
};

type ToastProps = { toast: ToastMessage; onDismiss: (id: string) => void };

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const closesItself = toast.tone === "success" || toast.tone === "info";
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!closesItself || isPaused) return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), SUCCESS_TOAST_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [closesItself, isPaused, onDismiss, toast.id]);

  const handleAction = () => {
    toast.action?.onClick();
    onDismiss(toast.id);
  };

  return (
    <div
      className="toast-enter"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <Message tone={toast.tone} title={toast.title} onDismiss={() => onDismiss(toast.id)}>
        {toast.body && <p>{toast.body}</p>}
        {toast.action && (
          <button type="button" onClick={handleAction} className={`${getButtonClassName({ size: "s", variant: "secondary" })} mt-2`}>
            {toast.action.label}
          </button>
        )}
      </Message>
    </div>
  );
}
