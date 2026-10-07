"use client";

import { ArrowLeft, LayoutGrid } from "lucide-react";

import type { ChatTopics } from "@/components/chat/use-chat-topics";
import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Chat window B's topic tray (docs/cwr-chat-guided-options-plan.md §4; owner choices 2026-10-06):
// above the question box on the chat's own page background; black topic buttons with 6px
// corners and 12px side padding, two per row (a lone last one fills its row). These are the
// only rounded buttons on the site (Style §11.3 exception). While a reply is on its way the
// buttons wait (aria-busy), so a double tap never sends twice.

const NAV_LINK_CLASS = "inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4";

type ChatTopicTrayProps = { topics: ChatTopics; isWaiting: boolean };

export function ChatTopicTray({ topics, isWaiting }: ChatTopicTrayProps) {
  const isBusy = isWaiting || topics.isReplying;
  return (
    <div role="group" aria-label="Chat topics" aria-busy={isBusy} className="grid gap-2 border-t border-line bg-page px-4 pt-3 pb-2">
      <p className="text-tag font-semibold tracking-eyebrow uppercase">{topics.branchLabel}</p>
      <ul className="flex flex-wrap gap-2">
        {topics.options.map((option) => (
          <li key={option.id} className="flex grow basis-34">
            <button
              type="button"
              onClick={() => topics.pick(option.id)}
              aria-disabled={isBusy || undefined}
              className={`${getButtonClassName({ size: "s", variant: "main" })} btn-chat-topic w-full ${isBusy ? "opacity-60" : ""}`}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
      {topics.canGoBack && (
        <div className="flex flex-wrap gap-x-6">
          <button type="button" onClick={topics.back} className={NAV_LINK_CLASS}>
            <ArrowLeft aria-hidden size={ICON_SIZE.inline} />
            Back
          </button>
          <button type="button" onClick={topics.reset} className={NAV_LINK_CLASS}>
            <LayoutGrid aria-hidden size={ICON_SIZE.inline} />
            All topics
          </button>
        </div>
      )}
    </div>
  );
}
