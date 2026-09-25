import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Style §11.12 messages: status icon + words (never color alone), tint background,
// errors use role="alert" and stay until dismissed; the rest use role="status".

export type MessageTone = "success" | "error" | "warning" | "info";

const TONE_STYLES: Record<MessageTone, { icon: LucideIcon; boxClass: string; iconClass: string }> = {
  success: { icon: CircleCheck, boxClass: "bg-success-tint border-success", iconClass: "text-success" },
  error: { icon: CircleAlert, boxClass: "bg-error-tint border-error", iconClass: "text-error" },
  warning: { icon: TriangleAlert, boxClass: "bg-warning-tint border-warning", iconClass: "text-warning" },
  info: { icon: Info, boxClass: "bg-info-tint border-info", iconClass: "text-info" },
};

type MessageProps = {
  tone: MessageTone;
  title: string;
  children?: ReactNode;
  onDismiss?: () => void;
  focusRef?: Ref<HTMLDivElement>;
};

export function Message({ tone, title, children, onDismiss, focusRef }: MessageProps) {
  const { icon: Icon, boxClass, iconClass } = TONE_STYLES[tone];
  return (
    <div
      ref={focusRef}
      tabIndex={focusRef ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 border p-4 text-ink ${boxClass}`}
    >
      <Icon aria-hidden size={ICON_SIZE.message} className={`shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-base leading-normal font-bold">{title}</p>
        {children && <div className="type-small mt-1">{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="-m-2.5 flex size-11 shrink-0 items-center justify-center">
          <X aria-hidden size={ICON_SIZE.button} />
        </button>
      )}
    </div>
  );
}
