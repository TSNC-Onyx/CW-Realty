import { BellRing } from "lucide-react";
import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { DeliveryLog } from "@/components/admin/notifications/delivery-log";
import { RecipientForm } from "@/components/admin/notifications/recipient-form";
import { RecipientList } from "@/components/admin/notifications/recipient-list";
import { TestAlertButton } from "@/components/admin/notifications/test-alert-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Message } from "@/components/ui/message";
import type { LoadResult } from "@/lib/admin/load-result";
import { fetchRecentDeliveries, fetchRecipients, type Delivery, type Recipient } from "@/lib/admin/notifications/queries";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, OWNER_ROLES, hasRole, requireAdminPage } from "@/lib/admin/require-admin";
import { isEmailConfigured } from "@/lib/email/send-email";

export const metadata: Metadata = { title: "Notifications" };

const KIND_LABELS: Record<Delivery["kind"], string> = {
  new_request: "New request alert",
  visitor_copy: "Copy to the visitor",
  reply: "Reply to the visitor",
  test: "Test alert",
  problem: "Problem alert",
};
const OWNER_NO_PROBLEM_RECIPIENT = "No one gets problem emails yet — switch someone on below. Problems are still recorded.";
const MANAGER_NO_PROBLEM_RECIPIENT = "No one gets problem emails yet — only an owner can switch someone on. Problems are still recorded.";
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function RecipientNotices({ recipients, isOwner }: { recipients: Recipient[]; isOwner: boolean }) {
  const activeRecipients = recipients.filter((recipient) => recipient.is_active);
  const hasProblemRecipient = activeRecipients.some((recipient) => recipient.gets_problem_alerts);
  return (
    <>
      {activeRecipients.length === 0 && (
        <Message tone="warning" title="Nobody gets alerts right now">
          <p>Add at least one person so new requests aren&apos;t missed.</p>
        </Message>
      )}
      {!hasProblemRecipient && (
        <Message tone="warning" title="Problem emails are off">
          <p>{isOwner ? OWNER_NO_PROBLEM_RECIPIENT : MANAGER_NO_PROBLEM_RECIPIENT}</p>
        </Message>
      )}
    </>
  );
}

function RecipientSection({ recipients, isOwner }: { recipients: Recipient[]; isOwner: boolean }) {
  if (recipients.length === 0) {
    return <EmptyState icon={BellRing} titleId="recipients-empty" title="No one yet" description="Add the people who should hear about new contact, TouchUp, and chat requests." action={<p className="type-small text-muted">Use the form below.</p>} />;
  }
  const items = recipients.map((recipient) => ({
    id: recipient.id,
    fullName: recipient.full_name,
    email: recipient.email,
    sources: recipient.alert_sources,
    isActive: recipient.is_active,
    getsProblemAlerts: recipient.gets_problem_alerts,
  }));
  return <RecipientList recipients={items} isOwner={isOwner} />;
}

function DeliverySection({ deliveries, notice }: { deliveries: LoadResult<Delivery[]>; notice: LoadProblemNotice | null }) {
  if (!deliveries.isLoaded) return <LoadProblem notice={notice} title="The email log didn't load" />;
  if (deliveries.data.length === 0) return <p>No emails yet.</p>;
  const items = deliveries.data.map((delivery) => ({
    id: delivery.id,
    kindLabel: KIND_LABELS[delivery.kind],
    isProblemAlert: delivery.kind === "problem",
    recipient: delivery.recipient_email,
    status: delivery.status,
    when: DATE_TIME.format(new Date(delivery.created_at)),
    error: delivery.last_error,
  }));
  return <DeliveryLog deliveries={items} />;
}

export default async function NotificationsPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const [recipients, deliveries] = await Promise.all([fetchRecipients(admin), fetchRecentDeliveries(admin)]);
  const notice = await reportPageLoad({ admin, action: "notifications.load", results: [recipients, deliveries] });
  const isOwner = hasRole(admin, OWNER_ROLES);
  const hasActiveRecipient = recipients.isLoaded && recipients.data.some((recipient) => recipient.is_active);
  return (
    <>
      <h1 className="type-h1 mb-2">Notifications</h1>
      <p className="type-lead mb-8 max-w-prose text-muted">Choose who gets an email when a new request comes in, and check that alerts arrive.</p>
      <div className="mb-8 grid max-w-prose gap-4">
        {!isEmailConfigured() && (
          <Message tone="warning" title="Email sending isn't set up yet">
            <p>Requests still reach the inbox. Alerts are logged below but not sent until the site owner connects MailerSend.</p>
            <p className="mt-1">Email isn&apos;t set up — problem emails can&apos;t be sent.</p>
          </Message>
        )}
        {recipients.isLoaded && <RecipientNotices recipients={recipients.data} isOwner={isOwner} />}
      </div>
      <section aria-labelledby="recipients-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="recipients-heading" className="type-h3 mb-4">Who gets alerts</h2>
        {recipients.isLoaded ? <RecipientSection recipients={recipients.data} isOwner={isOwner} /> : <LoadProblem notice={notice} title="The list of people didn't load" />}
        <h3 className="type-h3 mt-10 mb-4">Add a person</h3>
        <RecipientForm />
      </section>
      <section aria-labelledby="test-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="test-heading" className="type-h3 mb-2">Send a test alert</h2>
        <p className="mb-4 max-w-prose">Sends a short test email to everyone who gets alerts.</p>
        <TestAlertButton isDisabled={!hasActiveRecipient} />
      </section>
      <section aria-labelledby="log-heading" className="border-t-2 border-ink pt-6">
        <h2 id="log-heading" className="type-h3 mb-4">Recent emails</h2>
        <DeliverySection deliveries={deliveries} notice={notice} />
      </section>
    </>
  );
}
