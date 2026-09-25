import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { TextLink } from "@/components/ui/text-link";
import { fetchChatSession, type ChatMessageRow } from "@/lib/admin/chats/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Chat" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function getMessageNote(message: ChatMessageRow): string {
  if (message.role === "visitor") return "Visitor";
  if (message.outcome === "handoff") return "Assistant (AI) · offered a person";
  return `Assistant (AI) · cited ${message.cited_sections.join(", ")}`;
}

type ChatPageProps = { params: Promise<{ id: string }> };

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const admin = await requireAdminPage(EDITOR_ROLES);
  const sessionId = z.uuid().safeParse(id);
  if (!sessionId.success) notFound();
  const session = await fetchChatSession(admin, sessionId.data);
  if (!session) notFound();
  return (
    <>
      <TextLink href="/admin/chats">Back to chat history</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{`Chat on ${DATE_TIME.format(new Date(session.started_at))}`}</h1>
      {session.inbox_thread_id && (
        <p className="mb-6">
          <TextLink href={`/admin/inbox/${session.inbox_thread_id}`}>The visitor asked for a person: open the inbox message</TextLink>
        </p>
      )}
      <ol className="grid max-w-prose gap-3">
        {session.chat_messages.map((message, index) => (
          <li key={`${message.created_at}-${index}`} className={message.role === "visitor" ? "ml-10 bg-dark px-4 py-3 text-on-dark" : "mr-10 bg-surface-soft px-4 py-3"}>
            <p className={`text-tag font-bold ${message.role === "visitor" ? "text-on-dark-muted" : "text-muted"}`}>{`${getMessageNote(message)} · ${DATE_TIME.format(new Date(message.created_at))}`}</p>
            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
