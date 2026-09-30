"use client";

import { CircleAlert, CircleCheck, Clock, MailX, RotateCw, type LucideIcon } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { retryDeliveryAction } from "@/lib/admin/notifications/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

/** isProblemAlert: problem emails are re-sent by the scheduled run, so they never get Retry. */
export type DeliveryItem = { id: string; kindLabel: string; isProblemAlert: boolean; recipient: string; status: "pending" | "sending" | "sent" | "failed" | "not_sent"; when: string; error: string | null };

const STATUS_DISPLAY: Record<DeliveryItem["status"], { label: string; icon: LucideIcon; className: string }> = {
  sent: { label: "Sent", icon: CircleCheck, className: "text-success" },
  pending: { label: "Waiting to send", icon: Clock, className: "text-muted" },
  sending: { label: "Sending", icon: Clock, className: "text-muted" },
  failed: { label: "Failed", icon: CircleAlert, className: "text-error" },
  not_sent: { label: "Not sent — email isn't set up", icon: MailX, className: "text-warning" },
};

// Every alert email and its outcome; failed ones can be retried, except problem emails, which
// re-send on their own (Infra §3 dead-letter visibility).
export function DeliveryLog({ deliveries }: { deliveries: DeliveryItem[] }) {
  return (
    <ul className="border-b border-line">
      {deliveries.map((delivery) => {
        const { label, icon: Icon, className } = STATUS_DISPLAY[delivery.status];
        return (
          <li key={delivery.id} className="grid gap-2 border-t border-line py-3 md:grid-cols-12 md:items-center">
            <p className="type-small md:col-span-3">{delivery.when}</p>
            <p className="type-small md:col-span-4">
              <span className="font-semibold">{delivery.kindLabel}</span>
              <span className="block break-all text-muted">{delivery.recipient}</span>
            </p>
            <p className={`type-small flex items-start gap-1.5 font-semibold md:col-span-3 ${className}`}>
              <Icon aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0" />
              <span>
                {label}
                {delivery.status === "failed" && delivery.error && <span className="block font-regular text-muted">{delivery.error}</span>}
              </span>
            </p>
            <div className="md:col-span-2 md:text-right">
              {delivery.status === "failed" && !delivery.isProblemAlert && (
                <QuickActionButton label="Retry" accessibleLabel={`Retry the email to ${delivery.recipient}`} icon={RotateCw} problemAction="notifications.retry_delivery" onRun={() => retryDeliveryAction(delivery.id)} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
