import { CircleAlert, CircleCheck } from "lucide-react";

import type { QuickAnswerStatus } from "@/lib/chat/guided-steps";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin → Chatbot policy: which chat topic buttons the policy text can answer
// (docs/cwr-chat-guided-options-plan.md §6). A button shows on the website only once its
// "Quick answer: …" section is in the published policy. Status is icon plus words, never color alone.

const STATE_TEXT: Record<QuickAnswerStatus["state"], string> = {
  ready: "Ready",
  missing: "Missing: the button stays hidden",
  too_long: "Too long (over 600 characters): the button stays hidden",
};

export function QuickAnswerChecklist({ statuses }: { statuses: QuickAnswerStatus[] }) {
  const readyCount = statuses.filter((status) => status.state === "ready").length;
  return (
    <>
      <p className="mb-4 max-w-prose">{`Each chat topic button shows the text of its own section, word for word. Add a section with the exact heading below (one or two short sentences); the button appears once that version is published. ${readyCount} of ${statuses.length} ready in this text.`}</p>
      <ul className="grid max-w-prose gap-2">
        {statuses.map((status) => (
          <li key={status.title} className="flex items-start gap-2">
            {status.state === "ready" ? <CircleCheck aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-success" /> : <CircleAlert aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-warning" />}
            <span>
              <span className="font-semibold">{`# ${status.title}`}</span>
              <span className="text-muted">{` · ${STATE_TEXT[status.state]}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
