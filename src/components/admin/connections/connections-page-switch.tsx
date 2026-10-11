"use client";

import { CircleCheck, Eye, EyeOff } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { TextLink } from "@/components/ui/text-link";
import { setConnectionsPageVisibilityAction } from "@/lib/admin/connections/actions";
import type { ConnectionsPageSwitch as SwitchState } from "@/lib/admin/connections/page-switch";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONNECTIONS_PAGE_PATH } from "@/lib/site/navigation";

// Owner switch for the whole public Connections page (docs/cwr-connections-page-switch-plan.md):
// a status line, Hide/Show with Undo for owners, and a reminder when the chatbot still names it.

type ConnectionsPageSwitchProps = SwitchState & { canSwitch: boolean };

function SwitchStatus({ isVisible }: { isVisible: boolean }) {
  if (isVisible) {
    return (
      <p className="flex items-start gap-2">
        <CircleCheck aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-success" />
        Showing on the website, in the menu under Resources.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 font-semibold">
      <EyeOff aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0" />
      The Connections page is hidden from the website. Visitors who open its address are sent to Resources.
    </p>
  );
}

export function ConnectionsPageSwitch({ isVisible, isMentionedInChatPolicy, canSwitch }: ConnectionsPageSwitchProps) {
  return (
    <section aria-labelledby="page-switch-heading" className="mb-10 max-w-prose border-t-2 border-ink pt-6">
      <h2 id="page-switch-heading" className="type-h3 mb-2">Connections page on the website</h2>
      <SwitchStatus isVisible={isVisible} />
      {!isVisible && isMentionedInChatPolicy && (
        <p className="type-small mt-2 text-muted">
          Your chatbot policy still mentions the Connections page. <TextLink href="/admin/chat-policy">Update it in Chatbot policy</TextLink>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {canSwitch ? (
          <QuickActionButton
            label={isVisible ? "Hide the Connections page" : "Show the Connections page"}
            accessibleLabel={isVisible ? "Hide the Connections page from the website" : "Show the Connections page on the website"}
            icon={isVisible ? EyeOff : Eye}
            problemAction="connections.set_page_visibility"
            onRun={() => setConnectionsPageVisibilityAction(!isVisible)}
            undo={{ label: "Undo", problemAction: "connections.set_page_visibility", onRun: () => setConnectionsPageVisibilityAction(isVisible) }}
          />
        ) : (
          <p className="type-small text-muted">Only owners can show or hide the page.</p>
        )}
        {isVisible && <TextLink href={CONNECTIONS_PAGE_PATH} hasArrow>View the Connections page</TextLink>}
      </div>
    </section>
  );
}
