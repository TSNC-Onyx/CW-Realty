import { Mail, MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClosedDealBox } from "@/components/admin/closed-deals/closed-deal-box";
import { InboxStatusLabel } from "@/components/admin/inbox/inbox-status";
import { ThreadComposer } from "@/components/admin/inbox/thread-composer";
import { ThreadControls } from "@/components/admin/inbox/thread-controls";
import { TextLink } from "@/components/ui/text-link";
import { fetchThreadClosedDeal } from "@/lib/admin/closed-deals/queries";
import { addNoteAction, sendReplyAction } from "@/lib/admin/inbox/actions";
import { SOURCE_LABELS } from "@/lib/admin/inbox/inbox-labels";
import { fetchInboxThread, fetchTeammates, type InboxMessage } from "@/lib/admin/inbox/queries";
import { ALL_ROLES, EDITOR_ROLES, hasRole, requireAdminPage } from "@/lib/admin/require-admin";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getCallHref, getDisplayPhone, getTextHref, type E164Phone } from "@/lib/site/phone";

export const metadata: Metadata = { title: "Conversation" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

const MESSAGE_STYLES: Record<InboxMessage["kind"], { label: string; className: string }> = {
  inbound: { label: "From the visitor", className: "border-l-4 border-ink bg-surface" },
  reply: { label: "Reply sent by email", className: "border-l-4 border-info bg-info-tint" },
  internal_note: { label: "Team note — not sent", className: "border-l-4 border-warning bg-warning-tint" },
};

function ContactLinks({ email, phone }: { email: string | null; phone: string | null }) {
  const linkClass = "flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4";
  const e164 = phone as E164Phone | null;
  return (
    <ul className="flex flex-col gap-x-6 md:flex-row md:flex-wrap">
      {email && (
        <li>
          <a href={`mailto:${email}`} className={`${linkClass} break-all`}>
            <Mail aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
            {email}
          </a>
        </li>
      )}
      {e164 && (
        <li>
          <a href={getCallHref(e164)} className={linkClass}>
            <Phone aria-hidden size={ICON_SIZE.inline} />
            {`Call ${getDisplayPhone(e164)}`}
          </a>
        </li>
      )}
      {e164 && (
        <li>
          <a href={getTextHref(e164)} className={linkClass}>
            <MessageSquare aria-hidden size={ICON_SIZE.inline} />
            Text
          </a>
        </li>
      )}
    </ul>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdminPage(ALL_ROLES);
  const parsedId = z.uuid().safeParse(id);
  const thread = parsedId.success ? await fetchInboxThread(admin, parsedId.data) : null;
  if (!thread) notFound();
  const isEditor = hasRole(admin, EDITOR_ROLES);
  const [teammates, closedDeal] = await Promise.all([fetchTeammates(admin), isEditor ? fetchThreadClosedDeal(admin, thread.id) : Promise.resolve(null)]);
  const names = new Map(teammates.map((teammate) => [teammate.userId, teammate.label]));
  return (
    <>
      <TextLink href="/admin/inbox">Back to inbox</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{thread.contact_name}</h1>
      <p className="type-small mb-4 flex flex-wrap items-center gap-3 text-muted">
        <span>{SOURCE_LABELS[thread.source]}</span>
        <span>·</span>
        <InboxStatusLabel status={thread.status} />
        <span>·</span>
        <span>{DATE_TIME.format(new Date(thread.created_at))}</span>
      </p>
      <ContactLinks email={thread.contact_email} phone={thread.contact_phone} />
      <section aria-labelledby="handling-heading" className="mt-10 border-t-2 border-ink pt-6">
        <h2 id="handling-heading" className="type-h3 mb-4">Handling</h2>
        <ThreadControls threadId={thread.id} status={thread.status} assigneeId={thread.assignee_id} teammates={isEditor ? teammates : null} />
      </section>
      <section aria-labelledby="history-heading" className="mt-10 border-t-2 border-ink pt-6">
        <h2 id="history-heading" className="type-h3 mb-4">Conversation</h2>
        <ol className="grid max-w-prose gap-4">
          {thread.inbox_messages.map((message) => (
            <li key={message.id} className={`p-4 ${MESSAGE_STYLES[message.kind].className}`}>
              <p className="type-small mb-2 font-semibold">
                {MESSAGE_STYLES[message.kind].label}
                {message.author_id ? ` · ${names.get(message.author_id) ?? "Team member"}` : ""}
                {` · ${DATE_TIME.format(new Date(message.created_at))}`}
              </p>
              <p className="whitespace-pre-line">{message.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="reply-heading" className="mt-10 border-t-2 border-ink pt-6">
        <h2 id="reply-heading" className="type-h3 mb-4">Reply</h2>
        {thread.contact_email ? (
          <ThreadComposer label="Your reply" helperText={`Sent by email to ${thread.contact_email}. Their answer comes to the office email.`} buttonLabel="Send reply" pendingLabel="Sending…" kind="reply" onSend={sendReplyAction.bind(null, thread.id)} />
        ) : (
          <p className="max-w-prose">This person left a phone number only. Call or text them, then add a note about what you discussed.</p>
        )}
      </section>
      <section aria-labelledby="note-heading" className="mt-10 border-t-2 border-ink pt-6">
        <h2 id="note-heading" className="type-h3 mb-4">Team note</h2>
        <ThreadComposer label="Note for your team" helperText="Only people with admin access see notes." buttonLabel="Add note" pendingLabel="Adding…" kind="note" onSend={addNoteAction.bind(null, thread.id)} />
      </section>
      {isEditor && (
        <section aria-labelledby="deal-heading" className="mt-10 border-t-2 border-ink pt-6">
          <h2 id="deal-heading" className="type-h3 mb-4">Closed deal</h2>
          <ClosedDealBox threadId={thread.id} deal={closedDeal} />
        </section>
      )}
    </>
  );
}
