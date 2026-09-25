import { BellRing } from "lucide-react";
import type { Metadata } from "next";

import { DeliveryLog } from "@/components/admin/notifications/delivery-log";
import { RecipientForm } from "@/components/admin/notifications/recipient-form";
import { RecipientList } from "@/components/admin/notifications/recipient-list";
import { TestAlertButton } from "@/components/admin/notifications/test-alert-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Message } from "@/components/ui/message";
import { fetchRecentDeliveries, fetchRecipients } from "@/lib/admin/notifications/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { isEmailConfigured } from "@/lib/email/send-email";

export const metadata: Metadata = { title: "Notifications" };

const KIND_LABELS = { new_request: "New request alert", visitor_copy: "Copy to the visitor", reply: "Reply to the visitor", test: "Test alert" } as const;
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function NotificationsPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const [recipients, deliveries] = await Promise.all([fetchRecipients(admin), fetchRecentDeliveries(admin)]);
  const activeCount = recipients.filter((recipient) => recipient.is_active).length;
  return (
    <>
      <h1 className="type-h1 mb-2">Notifications</h1>
      <p className="type-lead mb-8 max-w-prose text-muted">Choose who gets an email when a new request comes in, and check that alerts arrive.</p>
      <div className="mb-8 grid max-w-prose gap-4">
        {!isEmailConfigured() && (
          <Message tone="warning" title="Email sending isn't set up yet">
            <p>Requests still reach the inbox. Alerts are logged below but not sent until the site owner connects MailerSend.</p>
          </Message>
        )}
        {activeCount === 0 && (
          <Message tone="warning" title="Nobody gets alerts right now">
            <p>Add at least one person so new requests aren&apos;t missed.</p>
          </Message>
        )}
      </div>
      <section aria-labelledby="recipients-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="recipients-heading" className="type-h3 mb-4">Who gets alerts</h2>
        {recipients.length === 0 ? (
          <EmptyState icon={BellRing} titleId="recipients-empty" title="No one yet" description="Add the people who should hear about new contact, TouchUp, and chat requests." action={<p className="type-small text-muted">Use the form below.</p>} />
        ) : (
          <RecipientList recipients={recipients.map((recipient) => ({ id: recipient.id, fullName: recipient.full_name, email: recipient.email, sources: recipient.alert_sources, isActive: recipient.is_active }))} />
        )}
        <h3 className="type-h3 mt-10 mb-4">Add a person</h3>
        <RecipientForm />
      </section>
      <section aria-labelledby="test-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="test-heading" className="type-h3 mb-2">Send a test alert</h2>
        <p className="mb-4 max-w-prose">Sends a short test email to everyone who gets alerts.</p>
        <TestAlertButton isDisabled={activeCount === 0} />
      </section>
      <section aria-labelledby="log-heading" className="border-t-2 border-ink pt-6">
        <h2 id="log-heading" className="type-h3 mb-4">Recent emails</h2>
        {deliveries.length === 0 ? (
          <p>No emails yet.</p>
        ) : (
          <DeliveryLog
            deliveries={deliveries.map((delivery) => ({
              id: delivery.id,
              kindLabel: KIND_LABELS[delivery.kind],
              recipient: delivery.recipient_email,
              status: delivery.status,
              when: DATE_TIME.format(new Date(delivery.created_at)),
              error: delivery.last_error,
            }))}
          />
        )}
      </section>
    </>
  );
}
